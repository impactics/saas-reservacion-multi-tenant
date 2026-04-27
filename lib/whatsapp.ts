/**
 * lib/whatsapp.ts
 * Envía mensajes via WhatsApp Business Cloud API (Meta).
 * Variables de entorno requeridas:
 *   WHATSAPP_API_URL   = https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
 *   WHATSAPP_API_TOKEN = token de acceso de Meta
 *   WHATSAPP_FROM_NUMBER = número remitente E.164, ej: +15551800156
 */

const API_URL   = process.env.WHATSAPP_API_URL;
const API_TOKEN = process.env.WHATSAPP_API_TOKEN;

if (!API_URL || !API_TOKEN) {
  console.warn(
    "[whatsapp] WHATSAPP_API_URL o WHATSAPP_API_TOKEN no configurados. " +
    "Los mensajes de WhatsApp no se enviarán."
  );
}

/**
 * Envía un mensaje de texto libre al número indicado.
 * @param to      - número destino en formato E.164 (ej: +593999870308)
 * @param message - texto plano, máx 4096 caracteres
 */
export async function sendWhatsAppText(to: string, message: string): Promise<void> {
  if (!API_URL || !API_TOKEN) {
    console.log(`[whatsapp] (simulado) → ${to}:\n${message}`);
    return;
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: sanitizePhone(to),
      type: "text",
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[whatsapp] Error ${res.status}: ${err}`);
  }
}

/**
 * Normaliza un número de teléfono al formato E.164 sin símbolos:
 * "+593 99 987 0308" → "593999870308"
 */
function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

// ─────────────────────────────────────────────────────────────────
// Plantillas de mensajes
// ─────────────────────────────────────────────────────────────────

const DAYS_ES = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MONTHS_ES = ["enero","febrero","marzo","abril","mayo","junio",
                   "julio","agosto","septiembre","octubre","noviembre","diciembre"];

function formatDatetime(date: Date, timezone = "America/Guayaquil"): string {
  const local = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  const day   = DAYS_ES[local.getDay()];
  const d     = local.getDate();
  const month = MONTHS_ES[local.getMonth()];
  const hh    = String(local.getHours()).padStart(2, "0");
  const mm    = String(local.getMinutes()).padStart(2, "0");
  return `${day} ${d} de ${month} a las ${hh}:${mm}`;
}

export interface BookingMessageData {
  patientName:      string;
  patientPhone:     string;
  serviceName:      string;
  professionalName: string;
  scheduledAt:      Date;
  durationMinutes:  number;
  organizationName: string;
  timezone?:        string;
}

/**
 * Mensaje de confirmación inmediata al paciente.
 */
export function buildConfirmationMessage(data: BookingMessageData): string {
  const dt = formatDatetime(data.scheduledAt, data.timezone);
  return (
    `✅ *¡Cita confirmada!*\n\n` +
    `Hola ${data.patientName}, tu cita ha sido agendada exitosamente.\n\n` +
    `📋 *Servicio:* ${data.serviceName}\n` +
    `👩‍⚕️ *Profesional:* ${data.professionalName}\n` +
    `📅 *Fecha y hora:* ${dt}\n` +
    `⏱ *Duración:* ${data.durationMinutes} min\n\n` +
    `Si necesitas cancelar o reagendar, contáctanos con anticipación.\n` +
    `_${data.organizationName}_`
  );
}

/**
 * Recordatorio 24 horas antes de la cita.
 */
export function buildReminderMessage(data: BookingMessageData): string {
  const dt = formatDatetime(data.scheduledAt, data.timezone);
  return (
    `⏰ *Recordatorio de cita*\n\n` +
    `Hola ${data.patientName}, te recordamos que mañana tienes una cita.\n\n` +
    `📋 *Servicio:* ${data.serviceName}\n` +
    `👩‍⚕️ *Profesional:* ${data.professionalName}\n` +
    `📅 *Fecha y hora:* ${dt}\n\n` +
    `¡Te esperamos! Si necesitas cambiar tu cita escríbenos.\n` +
    `_${data.organizationName}_`
  );
}
