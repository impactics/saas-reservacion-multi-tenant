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

> El schema completo con tipos, índices y relaciones está en [`prisma/schema.prisma`](./prisma/schema.prisma). Esta sección describe el propósito de cada entidad.

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
- `price` (Decimal 10,2), `currency`
- `active` (boolean)

### 4.4 AvailabilityRule (Horarios del doctor)
- `id`, `professional_id`, `organization_id`
- `day_of_week` (0=Dom ... 6=Sáb)
- `start_time`, `end_time` (ej: `"08:00"`, `"17:00"`)
- `slot_duration_minutes` (ej: 30)
- `active` (boolean)

### 4.5 BlackoutDate (Bloqueos / días no disponibles)
- `id`, `professional_id`, `organization_id`
- `date`, `start_time`, `end_time` (si ambos son null → bloqueo total del día)
- `reason` (opcional)

### 4.6 Booking (Reserva)
- `id` (cuid — generado por Prisma `@default(cuid())`)
- `organization_id`, `professional_id`, `service_id`
- `patient_name`, `patient_email`, `patient_phone`
- `scheduled_at` (timestamp UTC — conversiones con `date-fns-tz`)
- `duration_minutes`
- `status`: `PENDING` | `CONFIRMED` | `CANCELLED` | `RESCHEDULED` | `COMPLETED`
- `payment_status`: `UNPAID` | `PAID` | `REFUNDED`
- `payment_id` (referencia al proveedor de pagos)
- `google_event_id` (ID del evento en Google Calendar)
- `cancellation_reason`
- `created_at`, `updated_at`

### 4.7 BookingReschedule (Historial de cambios de fecha)
- `id`, `booking_id`, `organization_id`
- `previous_scheduled_at`
- `new_scheduled_at`
- `reason`
- `created_at`

### 4.8 NotificationJob (Cola de notificaciones)
- `id`, `booking_id`, `organization_id`
- `type`: `BOOKING_CONFIRMED` | `BOOKING_CANCELLED` | `BOOKING_RESCHEDULED` | `REMINDER_24H`
- `channel`: `WHATSAPP` | `EMAIL` | `CALENDAR`
- `status`: `PENDING` | `SENT` | `FAILED`
- `scheduled_for` (para recordatorios futuros)
- `attempts`, `last_error`
- `created_at`, `updated_at`

---

## 5. Flujos Principales

### 5.1 Flujo: Paciente agenda y paga una cita

```
1. Paciente entra al ecommerce /{slug}
2. Selecciona un servicio
3. El sistema consulta slots disponibles (GET /api/[slug]/availability)
   → lib/availability.ts → getAvailableSlots()
   → Calcula slots desde AvailabilityRule menos BlackoutDates y Bookings existentes
   → Cache en Upstash Redis por 60 segundos (lib/redis.ts)
4. Paciente elige fecha y hora
5. Paciente ingresa sus datos (nombre, email, teléfono)
6. Paciente procede al pago
7. Webhook del proveedor de pagos → POST /api/webhooks/payment
   → Valida firma del proveedor
   → Crea Booking con status CONFIRMED, payment_status PAID (transacción Prisma)
8. lib/notifications.ts → enqueueBookingConfirmedJobs() encola via QStash:
   a. WHATSAPP / BOOKING_CONFIRMED → /api/jobs/notify-whatsapp
   b. EMAIL / BOOKING_CONFIRMED → /api/jobs/notify-email
   c. CALENDAR / BOOKING_CONFIRMED → /api/jobs/sync-calendar
   d. WHATSAPP / REMINDER_24H → /api/jobs/reminder (con delay = 24h antes)
9. Admin del doctor ve la nueva cita en /admin
```

### 5.2 Flujo: Paciente cambia la fecha

```
1. Paciente entra al link de su reserva (token único en URL)
2. Ve su cita actual y botón "Cambiar fecha"
3. Sistema muestra slots disponibles (mismo GET /api/[slug]/availability)
4. Paciente elige nueva fecha
5. Transacción Prisma:
   a. Crea BookingReschedule con previous/new scheduled_at
   b. Actualiza Booking: status RESCHEDULED, nueva scheduled_at
6. QStash encola:
   a. WHATSAPP / BOOKING_RESCHEDULED → doctor y paciente
   b. EMAIL / BOOKING_RESCHEDULED → paciente
   c. CALENDAR / BOOKING_RESCHEDULED → actualizar evento en Google Calendar
   d. WHATSAPP / REMINDER_24H → re-programar recordatorio con nuevo delay
7. Admin ve el historial de cambios (BookingReschedule) en /admin
```

### 5.3 Flujo: Paciente cancela una cita

```
1. Paciente entra al link de su reserva
2. Presiona "Cancelar cita" e ingresa motivo
3. Booking → status CANCELLED, cancellation_reason guardado
4. QStash encola:
   a. WHATSAPP / BOOKING_CANCELLED → doctor
   b. WHATSAPP + EMAIL / BOOKING_CANCELLED → paciente
   c. CALENDAR / BOOKING_CANCELLED → eliminar evento en Google Calendar
5. Lógica de reembolso según política del tenant (por definir)
```

### 5.4 Flujo: Recordatorio automático 24h antes

```
1. Al crear/reagendar una cita, enqueueBookingConfirmedJobs() calcula:
   reminder = scheduledAt - 24h
   Si reminder > now() → encola job REMINDER_24H con scheduledFor = reminder
2. QStash ejecuta el job en el momento programado → POST /api/jobs/reminder
3. Job verifica que el Booking aún esté CONFIRMED (no cancelado)
4. Envía WhatsApp al paciente: "Recordatorio: tienes cita mañana a las X:XX"
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

1. **Un slot solo puede tener UNA reserva activa.** Al consultar disponibilidad se excluyen bookings con status `CONFIRMED`, `PENDING` o `RESCHEDULED`.
2. **La disponibilidad se calcula en el timezone del tenant**, no en UTC. Siempre usar `date-fns-tz` para conversiones. Ver `lib/availability.ts`.
3. **Nunca eliminar bookings.** Solo cambiar status. El historial es inmutable.
4. **Los jobs de notificación son independientes del flujo de pago.** Si un job falla, no afecta la reserva. Se reintenta hasta 3 veces (QStash retry automático).
5. **Google Calendar es un espejo**, no la fuente de verdad. La base de datos siempre gana.
6. **El token de Google Calendar se cifra** en base de datos. Nunca se expone en el frontend.
7. **Rate limiting en la API pública** (`/api/[slug]/...`): máximo 30 requests/minuto por IP usando Upstash Redis (`lib/redis.ts`).
8. **Cada tenant tiene su slug único.** El slug no se puede cambiar una vez creado (restricción a nivel de negocio, no de BD).
9. **Bloqueo optimista:** al crear un booking se verifica disponibilidad dentro de una transacción Prisma para evitar doble reserva en el mismo slot.
10. **Los jobs de recordatorio se cancelan** si la cita es cancelada antes de ejecutarse. QStash permite cancelar jobs por `messageId` — guardarlo en `NotificationJob` si se necesita cancelación explícita.

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
- Los endpoints `/api/jobs/*` validan la firma de QStash usando `qstashReceiver.verify()` de `lib/qstash.ts` antes de ejecutarse.
- El webhook de pagos valida firma HMAC del proveedor en `/api/webhooks/payment/route.ts`.
- `patient_email` y `patient_phone` se consideran datos sensibles. No se exponen en listados públicos.
- Toda comunicación sobre HTTPS (garantizado por Vercel).
- `google_calendar_token` se almacena cifrado. Nunca se serializa en respuestas de API.

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
| Multi-tenant | Single DB con `organization_id` | Simplicidad operacional con Neon |
| Disponibilidad | Calculada en demanda + cache Redis | Evita tabla de slots precalculados |
| Jobs asíncronos | Upstash QStash | Ya en el stack, serverless-native |
| Notificaciones | WhatsApp Business API oficial | Única opción escalable y confiable |
| ORM | Prisma 7 | Ya instalado, type-safe |
| Timezone | `date-fns-tz` | Conversiones UTC ↔ local del tenant |
| IDs de entidades | `cuid()` vía Prisma `@default(cuid())` | Consistente en todos los modelos |
| Precio de servicio | `Decimal(10,2)` en Prisma | Evita errores de punto flotante |
| Índices BD | `organizationId`, `professionalId`, `scheduledAt` | Queries de disponibilidad y listados son los más frecuentes |

---

## 12. Estructura de `lib/`

Todas las utilidades compartidas viven en `lib/`. Ninguna lógica de negocio va directamente en las API routes — las routes solo validan con Zod y delegan a `lib/`.

| Archivo | Responsabilidad |
|---------|----------------|
| `lib/prisma.ts` | Singleton del cliente Prisma. Importar siempre desde aquí: `import { prisma } from "@/lib/prisma"` |
| `lib/availability.ts` | `getAvailableSlots(professionalId, dateStr, organizationId)` — calcula slots libres respetando reglas, bloqueos y reservas existentes. Usa `date-fns-tz` para todas las conversiones. |
| `lib/notifications.ts` | `enqueueNotification()` — crea un `NotificationJob` en BD. `enqueueBookingConfirmedJobs()` — helper que encola los 4 jobs estándar (WhatsApp confirmación, Email, Calendar, Reminder 24h). |
| `lib/qstash.ts` | `qstash` — cliente QStash. `qstashReceiver` — verifica firma en `/api/jobs/*`. `publishJob({ path, body, delaySeconds })` — publica un job hacia una ruta interna. |
| `lib/redis.ts` | Cliente Upstash Redis. Usado para cache de disponibilidad (TTL 60s) y rate limiting en API pública. |
| `lib/calendar.ts` | Funciones para crear, actualizar y eliminar eventos en Google Calendar del profesional usando el token OAuth almacenado. |

### Patrón de uso en API routes

```ts
// ✅ Correcto — la route valida y delega
export async function POST(req: Request) {
  const body = BookingSchema.parse(await req.json()); // Zod
  const slots = await getAvailableSlots(...);          // lib/
  // ...
}

// ❌ Incorrecto — lógica de negocio dentro de la route
export async function POST(req: Request) {
  const rules = await prisma.availabilityRule.findMany(...); // no
  // cálculo de slots aquí...
}
```

---

## 13. Notas del Schema Prisma

> Archivo: [`prisma/schema.prisma`](./prisma/schema.prisma)

- **Todos los IDs** usan `@default(cuid())`. Corto, URL-safe, sin colisiones.
- **`organization_id` está en todas las tablas** excepto `BookingReschedule` que lo hereda vía `booking_id`. Esto permite queries directas por tenant sin JOINs.
- **Índices definidos** priorizan los queries más frecuentes:
  - `[professionalId, dayOfWeek, active]` → cálculo de disponibilidad
  - `[professionalId, scheduledAt]` → listado de agenda del doctor
  - `[status, scheduledFor]` → jobs pendientes de procesar
  - `[patientPhone]` → búsqueda de reservas desde WhatsApp (futuro)
- **`price` es `Decimal(10,2)`** — nunca usar `Float` para dinero.
- **`onDelete: Cascade`** en relaciones hijo → padre para mantener integridad al eliminar una organización o profesional.
- **`onDelete: Restrict`** en `Booking → Professional` y `Booking → Service` para evitar borrar un profesional con reservas activas.
- El output del cliente Prisma está en `app/generated/prisma` (ver `prisma.config.ts`).

---

## 14. Onboarding: Registrar un nuevo tenant

Pasos para dar de alta una nueva organización (doctor/clínica) en el sistema:

```ts
// 1. Crear la organización
const org = await prisma.organization.create({
  data: {
    slug: "clinica-dr-perez",          // único, inmutable
    name: "Clínica Dr. Pérez",
    timezone: "America/Guayaquil",
    whatsappEnabled: true,
    googleCalendarEnabled: true,
  },
});

// 2. Crear el profesional
const doctor = await prisma.professional.create({
  data: {
    organizationId: org.id,
    name: "Dr. Carlos Pérez",
    email: "dr.perez@clinica.com",
    phone: "+593987654321",
    specialty: "Medicina General",
  },
});

// 3. Crear los servicios
await prisma.service.create({
  data: {
    organizationId: org.id,
    professionalId: doctor.id,
    name: "Consulta General",
    durationMinutes: 30,
    price: 25.00,
    currency: "USD",
  },
});

// 4. Configurar horario semanal (Lunes a Viernes, 8am-5pm, slots de 30min)
const weekdays = [1, 2, 3, 4, 5];
await Promise.all(
  weekdays.map((day) =>
    prisma.availabilityRule.create({
      data: {
        organizationId: org.id,
        professionalId: doctor.id,
        dayOfWeek: day,
        startTime: "08:00",
        endTime: "17:00",
        slotDurationMinutes: 30,
      },
    })
  )
);
```

Ver [`prisma/seed.ts`](./prisma/seed.ts) para un ejemplo completo ejecutable con `npx prisma db seed`.

---

## 15. Convenciones de Código

### Estructura de archivos
- **Lógica de negocio** → siempre en `lib/`. Las API routes solo validan y delegan.
- **Validación de inputs** → Zod en cada route. Definir schemas en el mismo archivo o en `lib/schemas/`.
- **Tipos** → usar los tipos generados por Prisma desde `@/app/generated/prisma`. No redefinir tipos manualmente si Prisma ya los tiene.

### Naming
| Elemento | Convención | Ejemplo |
|----------|-----------|---------|
| Funciones en `lib/` | camelCase, verbo + sustantivo | `getAvailableSlots`, `enqueueNotification` |
| API routes | kebab-case en carpetas | `/api/jobs/notify-whatsapp` |
| Variables de entorno | SCREAMING_SNAKE_CASE | `QSTASH_TOKEN` |
| Modelos Prisma | PascalCase | `Organization`, `Booking` |
| Campos en BD | snake_case (via `@map`) | `organization_id`, `scheduled_at` |
| Campos en TypeScript | camelCase (Prisma los mapea) | `organizationId`, `scheduledAt` |

### Jobs de QStash
Cada handler en `/api/jobs/*` debe:
1. Verificar firma con `qstashReceiver.verify()` — si falla → `403`.
2. Parsear el body con Zod.
3. Ejecutar la acción (enviar WhatsApp, sincronizar Calendar, etc.).
4. Actualizar `NotificationJob.status` a `SENT` o `FAILED` + incrementar `attempts`.
5. En caso de error → lanzar excepción para que QStash reintente automáticamente.

```ts
// Patrón estándar para /api/jobs/*/route.ts
export async function POST(req: Request) {
  const isValid = await qstashReceiver.verify({ ... });
  if (!isValid) return new Response("Unauthorized", { status: 403 });

  const body = JobSchema.parse(await req.json());

  try {
    await doTheWork(body);
    await prisma.notificationJob.update({
      where: { id: body.jobId },
      data: { status: "SENT", attempts: { increment: 1 } },
    });
    return new Response("ok");
  } catch (err) {
    await prisma.notificationJob.update({
      where: { id: body.jobId },
      data: { status: "FAILED", attempts: { increment: 1 }, lastError: String(err) },
    });
    throw err; // QStash reintenta
  }
}
```

---

*Última actualización: Abril 2026*
