/**
 * lib/schemas.ts
 *
 * Schemas Zod centralizados para toda la aplicación.
 * Usar en API routes, Server Actions y formularios.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Primitivos reutilizables
// ─────────────────────────────────────────────────────────────

export const phoneSchema = z
  .string()
  .min(7, "Teléfono muy corto")
  .max(20, "Teléfono muy largo")
  .regex(/^[+\d\s\-()]+$/, "Formato de teléfono inválido");

export const emailSchema = z
  .string()
  .email("Email inválido")
  .max(255, "Email muy largo")
  .toLowerCase();

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "Contraseña muy larga")
  .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
  .regex(/[0-9]/, "Debe contener al menos un número");

export const cuidSchema = z
  .string()
  .regex(/^c[a-z0-9]{24}$/, "ID inválido");

export const slugSchema = z
  .string()
  .min(2, "Slug muy corto")
  .max(64, "Slug muy largo")
  .regex(/^[a-z0-9-]+$/, "Slug solo puede contener letras minúsculas, números y guiones");

// ─────────────────────────────────────────────────────────────
// OTP
// ─────────────────────────────────────────────────────────────

export const otpRequestSchema = z.object({
  action: z.literal("request"),
  phone: phoneSchema,
});

export const otpVerifySchema = z.object({
  action: z.literal("verify"),
  phone: phoneSchema,
  code: z
    .string()
    .length(6, "El código debe tener 6 dígitos")
    .regex(/^\d{6}$/, "El código solo debe contener dígitos"),
  name: z.string().min(1).max(128).optional(),
});

export const otpSchema = z.discriminatedUnion("action", [
  otpRequestSchema,
  otpVerifySchema,
]);

export type OtpRequest = z.infer<typeof otpRequestSchema>;
export type OtpVerify = z.infer<typeof otpVerifySchema>;

// ─────────────────────────────────────────────────────────────
// Auth (CredentialsProvider)
// ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Contraseña requerida").max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ─────────────────────────────────────────────────────────────
// Booking
// ─────────────────────────────────────────────────────────────

export const createBookingSchema = z.object({
  professionalId: cuidSchema,
  serviceId: cuidSchema,
  startTime: z.string().datetime("Fecha y hora inválida"),
  patientName: z
    .string()
    .min(2, "Nombre muy corto")
    .max(128, "Nombre muy largo")
    .trim(),
  patientEmail: emailSchema.optional(),
  patientPhone: phoneSchema.optional(),
  notes: z.string().max(500, "Notas muy largas").optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const cancelBookingSchema = z.object({
  bookingId: cuidSchema,
  reason: z.string().max(256).optional(),
});

export const rescheduleBookingSchema = z.object({
  bookingId: cuidSchema,
  newStartTime: z.string().datetime("Fecha y hora inválida"),
});

// ─────────────────────────────────────────────────────────────
// Organization
// ─────────────────────────────────────────────────────────────

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(128).trim().optional(),
  description: z.string().max(500).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
    .optional(),
  timezone: z.string().min(1).max(64).optional(),
  cancelRefundHours: z.number().int().min(0).max(168).optional(),
  cancelPartialHours: z.number().int().min(0).max(168).optional(),
  cancelPartialPct: z.number().int().min(0).max(100).optional(),
  maxReschedules: z.number().int().min(0).max(10).optional(),
});

// ─────────────────────────────────────────────────────────────
// Professional
// ─────────────────────────────────────────────────────────────

export const createProfessionalSchema = z.object({
  name: z.string().min(2).max(128).trim(),
  email: emailSchema.optional(),
  specialty: z.string().max(128).optional(),
  bio: z.string().max(1000).optional(),
});

export const updateProfessionalSchema = createProfessionalSchema.partial();

// ─────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────

export const createServiceSchema = z.object({
  professionalId: cuidSchema,
  name: z.string().min(2).max(128).trim(),
  description: z.string().max(500).optional(),
  durationMinutes: z
    .number()
    .int()
    .min(5, "Mínimo 5 minutos")
    .max(480, "Máximo 8 horas"),
  price: z
    .number()
    .nonnegative("El precio no puede ser negativo")
    .max(99999, "Precio muy alto"),
  currency: z.string().length(3, "Moneda debe tener 3 caracteres").default("USD"),
});

export const updateServiceSchema = createServiceSchema.partial().omit({
  professionalId: true,
});

// ─────────────────────────────────────────────────────────────
// Availability
// ─────────────────────────────────────────────────────────────

export const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:mm inválido"),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato HH:mm inválido"),
  slotDurationMinutes: z.number().int().min(5).max(240),
});

// ─────────────────────────────────────────────────────────────
// Webhook payloads
// ─────────────────────────────────────────────────────────────

export const payphoneWebhookSchema = z.object({
  clientTransactionId: z.string().min(1),
  transactionStatus: z.number().int(),
  id: z.union([z.string(), z.number()]).transform(String),
});

export type PayphoneWebhookPayload = z.infer<typeof payphoneWebhookSchema>;

// ─────────────────────────────────────────────────────────────
// API Key
// ─────────────────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  name: z.string().min(2).max(64).trim(),
  allowedOrigins: z
    .array(z.string().url("Origen inválido"))
    .max(10, "Máximo 10 orígenes"),
});

// ─────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
