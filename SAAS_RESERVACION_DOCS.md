# SaaS de Reservación Médica — Documentación Completa

> Plataforma multi-tenant para agendar citas médicas desde cualquier ecommerce.
> Desarrollado con Next.js 15, Prisma, PostgreSQL, Upstash Redis, Payphone y WhatsApp Cloud API.

---

## Índice

1. [Arquitectura General](#arquitectura-general)
2. [Variables de Entorno](#variables-de-entorno)
3. [Base de Datos](#base-de-datos)
4. [Flujo Completo del Paciente](#flujo-completo-del-paciente)
5. [Autenticación de Pacientes (OTP)](#autenticación-de-pacientes-otp)
6. [Política de Cancelación y Reembolsos](#política-de-cancelación-y-reembolsos)
7. [Notificaciones WhatsApp](#notificaciones-whatsapp)
8. [API Reference](#api-reference)
9. [Portal del Paciente](#portal-del-paciente)
10. [Cómo Integrar a un Nuevo Ecommerce](#cómo-integrar-a-un-nuevo-ecommerce)
11. [Migración de Base de Datos](#migración-de-base-de-datos)
12. [Checklist de Lanzamiento](#checklist-de-lanzamiento)

---

## Arquitectura General

```
ecommerce (ej: dramariabelencerda.com)
       │
       │  botón "Agendar cita"
       ▼
SaaS Reservación  (tudominio.app)
├── /{slug}                    ← página pública de la clínica
├── /{slug}/servicios          ← catálogo de servicios
├── /{slug}/booking            ← wizard de reserva + pago
├── /{slug}/mis-citas          ← portal del paciente (nuevo)
├── /{slug}/admin/**           ← panel del doctor
└── /api/{slug}/**             ← API REST

Infraestructura:
├── PostgreSQL (Neon / Supabase)
├── Upstash Redis (rate-limit + OTP cache)
├── Payphone (pagos + reembolsos)
└── WhatsApp Cloud API (Meta)
```

### Multi-Tenancy

Cada clínica tiene un `slug` único. Todas las rutas usan `/{slug}/...` y todas
las queries filtran por `organizationId`. Un solo deploy sirve a múltiples clínicas.

---

## Variables de Entorno

```env
# Base de datos
DATABASE_URL="postgresql://user:pass@host/db"

# Redis (Upstash)
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# WhatsApp Cloud API (Meta)
WHATSAPP_API_URL="https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages"
WHATSAPP_API_TOKEN="EAANZCnx..."          # Token de acceso Meta
WHATSAPP_FROM_NUMBER="+15551800156"        # Número remitente

# Payphone (Ecuador)
PAYPHONE_APP_ID="tu-token-payphone"        # Token Bearer
PAYPHONE_TOKEN="tu-token-firma"            # Token webhook verification

# Auth
NEXTAUTH_SECRET="una-clave-secreta-larga"  # JWT pacientes
ADMIN_API_KEY="clave-para-endpoints-admin" # Acceso admin a cancel/reschedule

# App
NEXT_PUBLIC_APP_URL="https://tudominio.app"
```

---

## Base de Datos

### Modelos principales

| Modelo | Descripción |
|--------|--------------|
| `Organization` | Cada clínica/doctor. Tiene slug, config de WhatsApp, política de cancelación |
| `Patient` | Paciente autenticado. Unique por (organizationId, phone) |
| `Professional` | El médico/especialista. Tiene horarios y calendario Google |
| `Service` | Servicio con precio, duración, imagen |
| `Booking` | Cita. Contiene estado de pago, refundAmount, accessToken |
| `BookingReschedule` | Historial de reprogramaciones |
| `AvailabilityRule` | Horario semanal recurrente |
| `BlackoutDate` | Días/horas bloqueados |
| `NotificationJob` | Cola de notificaciones pendientes |

### Campos de política de cancelación en Organization

| Campo | Por defecto | Significado |
|-------|-------------|-------------|
| `cancelRefundHours` | 24 | Horas mínimas antes de la cita para reembolso total |
| `cancelPartialHours` | 12 | Horas mínimas para reembolso parcial |
| `cancelPartialPct` | 50 | % de reembolso parcial |
| `maxReschedules` | 2 | Máximo de veces que se puede reprogramar |

---

## Flujo Completo del Paciente

```
1. Entra a /{slug} o desde botón en el ecommerce
       │
2. Elige servicio → /{slug}/servicios
       │
3. Elige fecha y hora → /{slug}/booking?serviceId=...
       │
4. Ingresa nombre, email, teléfono
       │
5. Paga con Payphone (tarjeta)
       │
6. Webhook Payphone confirma pago
       │
7. ★ Notificaciones automáticas:
       ├── WhatsApp al paciente (confirmación)
       ├── WhatsApp al doctor (nueva cita)
       └── Recordatorio 24h antes
       │
8. Paciente entra a /{slug}/mis-citas
       │
   8a. Ingresa su WhatsApp → recibe OTP → se autentica
       │
   8b. Ve sus citas próximas
       │
   8c. Puede reprogramar (si quedan reprogramaciones disponibles)
   8d. Puede cancelar (recibe reembolso según política)
```

---

## Autenticación de Pacientes (OTP)

No se requiere crear cuenta. El paciente verifica su identidad con su número de WhatsApp.

### Flujo

```
POST /api/{slug}/auth/otp  { action: "request", phone: "+5939..." }
  → Genera OTP de 6 dígitos
  → Guarda en Redis por 10 minutos (key: otp:{orgId}:{phone})
  → Envía mensaje WhatsApp con el código
  ← { sent: true }

POST /api/{slug}/auth/otp  { action: "verify", phone, code: "123456" }
  → Valida OTP en Redis
  → Crea o recupera Patient en BD
  → Genera JWT firmado (30 días)
  → Set-Cookie: patient_token=...; HttpOnly
  ← { patient: { id, phone, name }, token }
```

### Rate limiting
- Máx 3 solicitudes de OTP por teléfono cada 10 min
- Máx 5 intentos de verificación por teléfono cada 10 min

---

## Política de Cancelación y Reembolsos

### Lógica de reembolso

```
Horas hasta la cita ≥ cancelRefundHours (24h)  → Reembolso 100%
Horas hasta la cita ≥ cancelPartialHours (12h) → Reembolso parcial (50%)
Horas hasta la cita  < cancelPartialHours (12h) → Sin reembolso
```

Estos valores son **configurables por organización** desde el panel admin.

### Proceso de reembolso

1. Se calcula `refundCents` con `calcRefundAmount()` en `lib/payphone.ts`
2. Se llama a `refundPayphonePayment(paymentId, refundCents)` → endpoint Payphone `/api/button/Payments/refund`
3. Se actualiza `Booking.paymentStatus = "REFUNDED"` y `Booking.refundAmount`
4. Se notifica al paciente por WhatsApp con el monto del reembolso
5. El reembolso aparece en la cuenta del paciente en 3-5 días hábiles (Payphone)

> **Requisito:** Payphone debe tener habilitada la funcionalidad de reembolsos.
> Contactar a soporte@payphone.app para activarla en tu cuenta.

---

## Notificaciones WhatsApp

Todos los templates están en `lib/whatsapp.ts`.

| Evento | Destinatario | Función |
|--------|--------------|----------|
| Cita confirmada | Paciente | `buildConfirmationMessage()` |
| Cita confirmada | Doctor | `buildDoctorNewBookingMessage()` |
| Recordatorio 24h | Paciente | `buildReminderMessage()` |
| Cita cancelada | Paciente + Doctor | `buildCancellationMessage()` |
| Cita reprogramada | Paciente + Doctor | `buildRescheduleMessage()` |
| OTP login | Paciente | inline en `lib/patient-auth.ts` |

Si `WHATSAPP_API_URL` o `WHATSAPP_API_TOKEN` no están configurados, los mensajes
se imprimen en consola (modo simulado). Útil para desarrollo local.

---

## API Reference

### Autenticación de pacientes

```
POST /api/{slug}/auth/otp
Body: { action: "request"|"verify", phone, code?, name? }
```

### Citas del paciente

```
GET  /api/{slug}/patients/me/bookings?upcoming=true
Auth: cookie patient_token
```

### Cancelar cita

```
POST /api/{slug}/bookings/{bookingId}/cancel
Auth: cookie patient_token | ?token={accessToken} | ?adminKey={ADMIN_API_KEY}
Body: { reason?: string }
Response: { success, refundPct, refundAmount, refundStatus }
```

### Reprogramar cita

```
POST /api/{slug}/bookings/{bookingId}/reschedule
Auth: cookie patient_token | ?token={accessToken} | ?adminKey={ADMIN_API_KEY}
Body: { scheduledAt: "2025-06-15T10:00:00Z", reason?: string }
Response: { success, scheduledAt }
```

### Slots disponibles

```
GET /api/{slug}/availability?professionalId=...&date=2025-06-15
```

### Crear reserva (sin pago aún)

```
POST /api/{slug}/bookings
Body: { professionalId, serviceId, patientName, patientEmail?, patientPhone, scheduledAt }
```

### Iniciar pago

```
POST /api/{slug}/bookings/{bookingId}/payment
Body: { callbackUrl, cancellationUrl }
Response: { paymentUrl }
```

---

## Portal del Paciente

Ruta: `/{slug}/mis-citas`

### Características
- Login sin contraseña vía OTP WhatsApp
- Sesión persistente 30 días (cookie httpOnly)
- Vista de citas próximas y todas
- Cancelar cita con motivo opcional
- Botón para reprogramar (redirige al wizard de booking)
- Feedback visual del reembolso aplicado
- Estado vacío con CTA para agendar

---

## Cómo Integrar a un Nuevo Ecommerce

### Opción A — Botón de enlace (5 min)

Añade este botón en cualquier página del ecommerce:

```html
<a href="https://tudominio.app/SLUG-DEL-DOCTOR"
   target="_blank"
   style="background:#0f766e;color:white;padding:12px 28px;
          border-radius:8px;font-weight:600;text-decoration:none">
  🗓️ Agendar cita
</a>
```

### Opción B — Iframe embebido

```html
<!-- En una página del ecommerce -->
<iframe
  src="https://tudominio.app/SLUG-DEL-DOCTOR?embed=1"
  width="100%"
  height="700"
  frameborder="0"
  allow="payment"
  style="border-radius:12px">
</iframe>
```

### Opción C — API headless

El ecommerce usa su propio diseño y consume la API directamente:

```javascript
// 1. Obtener servicios
const { services } = await fetch('/api/SLUG/services').then(r => r.json());

// 2. Obtener slots disponibles
const { slots } = await fetch(
  '/api/SLUG/availability?professionalId=X&date=2025-06-15'
).then(r => r.json());

// 3. Crear reserva
const { booking } = await fetch('/api/SLUG/bookings', {
  method: 'POST',
  body: JSON.stringify({ professionalId, serviceId, patientName, patientPhone, scheduledAt })
}).then(r => r.json());

// 4. Redirigir al pago
const { paymentUrl } = await fetch(`/api/SLUG/bookings/${booking.id}/payment`, {
  method: 'POST',
  body: JSON.stringify({ callbackUrl: '...', cancellationUrl: '...' })
}).then(r => r.json());
window.location.href = paymentUrl;
```

### Crear una nueva organización (nuevo doctor)

```sql
INSERT INTO organizations (id, slug, name, description, phone_whatsapp, whatsapp_enabled)
VALUES (
  gen_random_uuid(),
  'dr-nuevo-doctor',
  'Dr. Nuevo Doctor',
  'Especialista en Medicina General',
  '+5939XXXXXXXX',
  true
);
```

O usar la API de superadmin (por implementar):
```
POST /api/admin/organizations
Body: { slug, name, description, phoneWhatsapp, timezone }
```

---

## Migración de Base de Datos

### Opción 1: Prisma Migrate (recomendado)

```bash
npx prisma migrate dev --name patient_and_cancel_policy
```

### Opción 2: SQL directo

Ejecutar el archivo `prisma/migrations/patient_and_cancel_policy.sql`
en tu panel de base de datos (Neon, Supabase, etc.).

---

## Checklist de Lanzamiento

### Configuración
- [ ] Variables de entorno configuradas en Vercel/Railway
- [ ] `WHATSAPP_API_URL` con el Phone Number ID correcto
- [ ] `WHATSAPP_API_TOKEN` con token de acceso Meta
- [ ] `PAYPHONE_APP_ID` y `PAYPHONE_TOKEN` activos
- [ ] Reembolsos habilitados en cuenta Payphone (contactar soporte)
- [ ] `NEXTAUTH_SECRET` con valor aleatorio seguro
- [ ] `NEXT_PUBLIC_APP_URL` apuntando al dominio de producción

### Base de datos
- [ ] Migración ejecutada (`npx prisma migrate deploy`)
- [ ] Organización creada con slug correcto
- [ ] Profesional(es) creado(s)
- [ ] Servicios activos con precio y duración
- [ ] Reglas de disponibilidad configuradas

### Integración ecommerce
- [ ] Botón "Agendar cita" añadido en el ecommerce
- [ ] URL del botón apunta al slug correcto
- [ ] Prueba de flujo completo: agendar → pagar → WhatsApp → mis-citas → cancelar

### WhatsApp
- [ ] Número de WhatsApp Business verificado en Meta
- [ ] Prueba de OTP enviado y recibido
- [ ] Prueba de confirmación de cita enviada al paciente
- [ ] Prueba de notificación al doctor

---

*Última actualización: Abril 2026*
