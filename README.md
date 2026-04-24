# 🏥 SaaS de Reservaciones Multi-Tenant

Sistema de agendamiento médico multi-tenant. Cada doctor tiene su propio ecommerce (`/{slug}`) donde los pacientes compran servicios, eligen fecha/hora, pagan y reciben confirmación por WhatsApp y correo. Las citas se sincronizan automáticamente con Google Calendar del doctor.

> **Antes de tocar código, leer [`SAAS_MODEL.md`](./SAAS_MODEL.md).** Es la fuente de verdad del proyecto.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| Base de datos | Neon (PostgreSQL serverless) |
| ORM | Prisma 7 |
| Deploy | Vercel |
| Cola de jobs | Upstash QStash |
| Cache / Rate limiting | Upstash Redis |
| Calendario | Google Calendar API |
| WhatsApp | Meta WhatsApp Business API |
| Email | Resend |
| Auth | NextAuth v4 |
| Validación | Zod |

---

## Requisitos

- Node.js 20+
- Una base de datos Neon (o PostgreSQL local)
- Cuentas en: Upstash, Google Cloud Console, Meta for Developers, Resend

---

## Setup local

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/impactics/saas-reservacion-multi-tenant.git
cd saas-reservacion-multi-tenant
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales

# 3. Sincronizar el schema con la base de datos
npx prisma migrate dev

# 4. Seed de datos de prueba
npx prisma db seed

# 5. Arrancar en desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Estructura principal

```
app/
├── [slug]/          # Ecommerce público del tenant (pacientes)
├── admin/           # Panel del doctor / organización
└── api/
    ├── [slug]/      # Endpoints públicos (disponibilidad, reservas)
    ├── webhooks/    # Pagos, Google Calendar, WhatsApp
    └── jobs/        # Endpoints internos llamados por QStash

prisma/
├── schema.prisma    # Esquema completo de la BD
└── seed.ts          # Datos de prueba

lib/                 # Utilidades compartidas (db, qstash, redis, calendar, whatsapp)
```

---

## Documentación

| Archivo | Contenido |
|---------|-----------|
| [`SAAS_MODEL.md`](./SAAS_MODEL.md) | Arquitectura completa, entidades, flujos, reglas de negocio |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Diagrama de flujo técnico, estructura de `lib/`, guía de desarrollo |
| [`.env.example`](./.env.example) | Todas las variables de entorno necesarias |

---

## Multi-tenant

Cada tenant es una `Organization` con un `slug` único. El aislamiento es por `organization_id` en cada tabla (single-database multi-tenant). No se necesitan bases de datos separadas.

```
https://tudominio.com/clinica-dr-perez     → tenant: clinica-dr-perez
https://tudominio.com/consultas-dra-garcia → tenant: consultas-dra-garcia
```

---

## Variables de entorno

Ver [`.env.example`](./.env.example) para la lista completa con instrucciones. Las variables mínimas para desarrollo local son:

```
DATABASE_URL
NEXT_PUBLIC_APP_URL
UPSTASH_REDIS_REST_URL + TOKEN
QSTASH_TOKEN + signing keys
NEXTAUTH_URL + SECRET
```

---

## Scripts útiles

```bash
npm run dev          # Desarrollo
npm run build        # Build producción
npx prisma studio    # Explorar la BD visualmente
npx prisma migrate dev --name <nombre>  # Nueva migración
```

---

*Última actualización: Abril 2026*
