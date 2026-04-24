# SAAS_MODEL.md — Sistema de Reservaciones Multi-Tenant

> **Fuente de verdad del proyecto.** Cualquier IA, desarrollador o colaborador debe leer este archivo antes de tocar código. No se implementa nada que contradiga este modelo sin actualizar primero este documento.

---

## 1. Visión General

Sistema SaaS de agendamiento médico multi-tenant que se integra como módulo de reservas dentro de ecommerce de doctores. Cada doctor tiene su propio ecommerce (tenant) donde los pacientes pueden comprar servicios médicos, elegir fecha/hora disponible y pagar. Todas las reservas se notifican por WhatsApp y correo, y se sincronizan con Google Calendar del doctor.

**Objetivo futuro:** permitir agendar y pagar directamente desde WhatsApp.

---

## 2. Stack Tecnológico Definido

| Capa | Tecnología | Uso |
|------|-----------|-----|
| Framework | Next.js 16 (App Router) | Frontend + API Routes |
| Base de datos | Neon (PostgreSQL serverless) | Fuente de verdad principal |
| ORM | Prisma 7 | Acceso a datos |
| Deploy | Vercel | Hosting + Serverless Functions |
| Infraestructura extra | DigitalOcean | Workers/jobs de larga duración si se necesita |
| Cola de mensajes | Upstash QStash | Jobs asíncronos (notificaciones, recordatorios) |
| Cache / Rate limiting | Upstash Redis | Cache de disponibilidad, rate limiting de API |
| Calendario | Google Calendar API | Sincronización de citas del doctor |
| WhatsApp | WhatsApp Business API (Meta) | Notificaciones transaccionales |
| Email | Resend | Confirmaciones y recordatorios por correo |
| Auth | NextAuth v4 | Autenticación admin/doctor |
| Validación | Zod | Validación de esquemas en API |
| Pagos | (definir: Stripe o MercadoPago) | Cobro de servicios |

---

## 3. Modelo Multi-Tenant

Cada **organización** (clínica o doctor) es un tenant. El aislamiento es por `organization_id` en cada tabla, NO por base de datos separada (single-database multi-tenant).

```
Organización (tenant)
  └── Profesionales (doctores)
        └── Servicios
              └── Reglas de disponibilidad
                    └── Reservas (bookings)
```

Un tenant puede tener múltiples doctores. Cada doctor maneja su propia agenda.

---

## 4. Entidades del Dominio

### 4.1 Organization (Tenant)
- `id`, `slug` (usado en URL: `/{slug}/servicios`)
- `name`, `logo_url`, `phone_whatsapp`
- `timezone` (ej: `America/Guayaquil`)
- `google_calendar_enabled` (boolean)
- `whatsapp_enabled` (boolean)
- `created_at`

### 4.2 Professional (Doctor)
- `id`, `organization_id`
- `name`, `email`, `phone`
- `specialty`
- `google_calendar_token` (OAuth token cifrado)
- `google_calendar_id`
- `active` (boolean)

### 4.3 Service (Servicio médico)
- `id`, `organization_id`, `professional_id`
- `name`, `description`, `duration_minutes`
- `price`, `currency`
- `active` (boolean)

### 4.4 AvailabilityRule (Horarios del doctor)
- `id`, `professional_id`
- `day_of_week` (0=Dom ... 6=Sáb)
- `start_time`, `end_time` (ej: "08:00", "17:00")
- `slot_duration_minutes` (ej: 30)
- `active` (boolean)

### 4.5 BlackoutDate (Bloqueos / días no disponibles)
- `id`, `professional_id`
- `date`, `start_time`, `end_time`
- `reason` (opcional)

### 4.6 Booking (Reserva)
- `id` (nanoid), `organization_id`, `professional_id`, `service_id`
- `patient_name`, `patient_email`, `patient_phone`
- `scheduled_at` (timestamp con timezone)
- `duration_minutes`
- `status`: `PENDING` | `CONFIRMED` | `CANCELLED` | `RESCHEDULED` | `COMPLETED`
- `payment_status`: `UNPAID` | `PAID` | `REFUNDED`
- `payment_id` (referencia al proveedor de pagos)
- `google_event_id` (ID del evento en Google Calendar)
- `cancellation_reason`
- `created_at`, `updated_at`

### 4.7 BookingReschedule (Historial de cambios de fecha)
- `id`, `booking_id`
- `previous_scheduled_at`
- `new_scheduled_at`
- `reason`
- `created_at`

### 4.8 NotificationJob (Cola de notificaciones)
- `id`, `booking_id`
- `type`: `BOOKING_CONFIRMED` | `BOOKING_CANCELLED` | `BOOKING_RESCHEDULED` | `REMINDER_24H`
- `channel`: `WHATSAPP` | `EMAIL` | `CALENDAR`
- `status`: `PENDING` | `SENT` | `FAILED`
- `scheduled_for` (para recordatorios futuros)
- `attempts`, `last_error`
- `created_at`

---

## 5. Flujos Principales

### 5.1 Flujo: Paciente agenda y paga una cita

```
1. Paciente entra al ecommerce /{slug}
2. Selecciona un servicio
3. El sistema consulta slots disponibles (GET /api/[slug]/availability)
   → Se calculan slots desde AvailabilityRule menos BlackoutDates y Bookings existentes
   → Cache en Upstash Redis por 60 segundos
4. Paciente elige fecha y hora
5. Paciente ingresa sus datos (nombre, email, teléfono)
6. Paciente procede al pago
7. Al confirmar pago → se crea el Booking con status CONFIRMED, payment_status PAID
8. QStash encola 4 jobs:
   a. Notificar WhatsApp al doctor
   b. Notificar WhatsApp + Email al paciente
   c. Crear evento en Google Calendar del doctor
   d. Programar job de recordatorio 24h antes
9. Admin del doctor ve la nueva cita en /admin
```

### 5.2 Flujo: Paciente cambia la fecha

```
1. Paciente entra al link de su reserva (token único)
2. Ve su cita actual y botón "Cambiar fecha"
3. Sistema muestra slots disponibles
4. Paciente elige nueva fecha
5. Se registra en BookingReschedule el cambio
6. Booking se actualiza: status RESCHEDULED, nueva scheduled_at
7. QStash encola:
   a. Notificar WhatsApp al doctor del cambio
   b. Notificar WhatsApp + Email al paciente
   c. Actualizar evento en Google Calendar
   d. Re-programar recordatorio 24h
8. Admin ve el historial de cambios en /admin
```

### 5.3 Flujo: Paciente cancela una cita

```
1. Paciente entra al link de su reserva
2. Presiona "Cancelar cita" e ingresa motivo
3. Booking → status CANCELLED
4. QStash encola:
   a. Notificar WhatsApp al doctor
   b. Notificar WhatsApp + Email al paciente (confirmación de cancelación)
   c. Eliminar/cancelar evento en Google Calendar
5. Lógica de reembolso según política del tenant (por definir)
```

### 5.4 Flujo: Recordatorio automático 24h antes

```
1. Al crear/reagendar una cita, QStash programa un job con delay
2. Job se ejecuta 24h antes de scheduled_at
3. Se envía WhatsApp al paciente: "Recordatorio: tienes cita mañana a las X:XX"
4. Se envía email de recordatorio al paciente
5. NotificationJob queda en status SENT
```

### 5.5 Flujo futuro: Agendar desde WhatsApp

```
1. Paciente escribe al número de WhatsApp Business del doctor
2. Bot responde con servicios disponibles
3. Paciente selecciona servicio y fecha
4. Bot envía link de pago
5. Al pagar → mismo flujo que 5.1 desde el paso 7
```

---

## 6. Estructura de Rutas (Next.js App Router)

```
app/
├── [slug]/                          # Ecommerce público del tenant
│   ├── page.tsx                     # Home del ecommerce
│   ├── servicios/
│   │   └── page.tsx                 # Catálogo de servicios
│   ├── booking/
│   │   ├── [serviceId]/
│   │   │   └── page.tsx             # Selección de fecha/hora + datos del paciente
│   │   └── [bookingId]/
│   │       ├── page.tsx             # Detalle de la reserva del paciente
│   │       ├── reschedule/page.tsx  # Cambiar fecha
│   │       └── cancel/page.tsx      # Cancelar cita
│   └── checkout/
│       └── [serviceId]/page.tsx     # Pago
│
├── admin/                           # Panel del doctor / organización
│   ├── layout.tsx                   # Layout con auth guard
│   ├── page.tsx                     # Dashboard
│   ├── bookings/
│   │   ├── page.tsx                 # Lista de reservas
│   │   └── [bookingId]/page.tsx     # Detalle de reserva
│   ├── availability/
│   │   └── page.tsx                 # Configurar horarios
│   ├── services/
│   │   └── page.tsx                 # Gestión de servicios
│   └── settings/
│       └── page.tsx                 # Configuración del tenant
│
└── api/
    ├── [slug]/
    │   ├── availability/route.ts    # GET slots disponibles
    │   ├── booking/route.ts         # POST crear reserva
    │   └── booking/[id]/
    │       ├── route.ts             # GET detalle
    │       ├── reschedule/route.ts  # PATCH cambiar fecha
    │       └── cancel/route.ts      # PATCH cancelar
    ├── webhooks/
    │   ├── payment/route.ts         # Webhook del proveedor de pagos
    │   ├── google-calendar/route.ts # Webhook de Google Calendar
    │   └── whatsapp/route.ts        # Webhook de WhatsApp (futuro bot)
    └── jobs/                        # Endpoints internos llamados por QStash
        ├── notify-whatsapp/route.ts
        ├── notify-email/route.ts
        ├── sync-calendar/route.ts
        └── reminder/route.ts
```

---

## 7. Reglas de Negocio Críticas

1. **Un slot solo puede tener UNA reserva activa.** Al consultar disponibilidad se excluyen bookings con status `CONFIRMED` o `RESCHEDULED`.
2. **La disponibilidad se calcula en el timezone del tenant**, no en UTC. Siempre usar `date-fns-tz` para conversiones.
3. **Nunca eliminar bookings.** Solo cambiar status. El historial es inmutable.
4. **Los jobs de notificación son independientes del flujo de pago.** Si un job falla, no afecta la reserva. Se reintenta hasta 3 veces.
5. **Google Calendar es un espejo**, no la fuente de verdad. La base de datos siempre gana.
6. **El token de Google Calendar se cifra** en base de datos. Nunca se expone en el frontend.
7. **Rate limiting en la API pública** (`/api/[slug]/...`): máximo 30 requests/minuto por IP usando Upstash Redis.
8. **Cada tenant tiene su slug único.** El slug no se puede cambiar una vez creado.
9. **Bloqueo optimista:** al crear un booking se verifica disponibilidad dentro de una transacción Prisma para evitar doble reserva en el mismo slot.
10. **Los jobs de recordatorio se cancelan** si la cita es cancelada antes de ejecutarse. QStash permite cancelar jobs por messageId.

---

## 8. Notificaciones — Plantillas

### WhatsApp al Doctor (nueva cita)
```
🩺 Nueva cita agendada
Paciente: {patient_name}
Servicio: {service_name}
Fecha: {date} a las {time}
Teléfono: {patient_phone}
```

### WhatsApp al Paciente (confirmación)
```
✅ Cita confirmada
Dr./Dra.: {professional_name}
Servicio: {service_name}
Fecha: {date} a las {time}
¿Necesitas cambiar la fecha? Entra aquí: {reschedule_url}
```

### WhatsApp al Paciente (recordatorio 24h)
```
⏰ Recordatorio: tienes una cita mañana
Dr./Dra.: {professional_name}
Fecha: {date} a las {time}
¿Necesitas cancelar? {cancel_url}
```

### WhatsApp al Doctor (cambio de fecha)
```
🔄 Cambio de cita
Paciente: {patient_name}
Fecha anterior: {old_date}
Nueva fecha: {new_date} a las {new_time}
```

### WhatsApp al Doctor (cancelación)
```
❌ Cita cancelada
Paciente: {patient_name}
Fecha: {date} a las {time}
Motivo: {reason}
```

---

## 9. Seguridad

- Rutas `/admin/*` protegidas con NextAuth. Solo el owner/admin del tenant puede acceder.
- Los endpoints `/api/jobs/*` validan la firma de QStash antes de ejecutarse.
- El webhook de pagos valida firma del proveedor.
- `patient_email` y `patient_phone` se consideran datos sensibles. No se exponen en listados públicos.
- Toda comunicación sobre HTTPS (garantizado por Vercel).

---

## 10. Lo que NO está en scope ahora

- [ ] Panel super-admin para gestionar todos los tenants
- [ ] Facturación / cobro del SaaS a los doctores
- [ ] App móvil nativa
- [ ] Video-consulta
- [ ] Historial clínico del paciente
- [ ] Bot de WhatsApp para agendar (fase 2)
- [ ] Pago desde WhatsApp (fase 2)
- [ ] Multi-idioma

---

## 11. Decisiones Técnicas Tomadas

| Decisión | Opción elegida | Razón |
|----------|---------------|-------|
| Multi-tenant | Single DB con organization_id | Simplicidad operacional con Neon |
| Disponibilidad | Calculada en demanda + cache Redis | Evita tabla de slots precalculados |
| Jobs asíncronos | Upstash QStash | Ya en el stack, serverless-native |
| Notificaciones | WhatsApp Business API oficial | Única opción escalable y confiable |
| ORM | Prisma | Ya instalado, type-safe |
| Timezone | date-fns-tz | Ya en el stack |
| IDs de bookings | nanoid | URLs amigables para el paciente |

---

*Última actualización: Abril 2026*
