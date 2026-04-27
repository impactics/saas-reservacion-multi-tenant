/**
 * lib/whatsapp.ts
 * Envía mensajes via WhatsApp Business Cloud API (Meta).
 * Variables de entorno requeridas:
 *   WHATSAPP_API_URL     = https://graph.facebook.com/v19.0/{PHONE_NUMBER_ID}/messages
 *   WHATSAPP_API_TOKEN   = token de acceso de Meta
 *   WHATSAPP_FROM_NUMBER = número remitente E.164
 */

const API_URL   = process.env.WHATSAPP_API_URL;
const API_TOKEN = process.env.WHATSAPP_API_TOKEN;

if (!API_URL || !API_TOKEN) {
  console.warn("[whatsapp] WHATSAPP_API_URL o WHATSAPP_API_TOKEN no configurados.");
}

export async function sendWhatsAppText(to: string, message: string): Promise<void> {
  if (!API_URL || !API_TOKEN) {
    console.log(`[whatsapp] (simulado) → ${to}:\n${message}`);
    return;
  }
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_TOKEN}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: sanitizePhone(to),
      type: "text",
      text: { body: message },
    }),
  });
  if (!res.ok) throw new Error(`[whatsapp] Error ${res.status}: ${await res.text()}`);
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

const DAYS_ES   = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
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

export function buildConfirmationMessage(data: BookingMessageData): string {
  const dt = formatDatetime(data.scheduledAt, data.timezone);
  return (
    `✅ *¡Cita confirmada!*\n\n` +
    `Hola ${data.patientName}, tu cita ha sido agendada exitosamente.\n\n` +
    `📋 *Servicio:* ${data.serviceName}\n` +
    `👩‍⚕️ *Profesional:* ${data.professionalName}\n` +
    `📅 *Fecha y hora:* ${dt}\n` +
    `⏱ *Duración:* ${data.durationMinutes} min\n\n` +
    `Para ver o gestionar tu cita visita:\n` +
    `{PORTAL_URL}\n\n` +
    `_${data.organizationName}_`
  );
}

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

export function buildCancellationMessage(
  data: BookingMessageData & { refundPct: number; refundAmount?: number; currency?: string }
): string {
  const dt = formatDatetime(data.scheduledAt, data.timezone);
  let refundLine = "";
  if (data.refundPct === 100) {
    refundLine = `\n💳 *Reembolso:* Se procesará el reembolso total en 3-5 días hábiles.`;
  } else if (data.refundPct > 0 && data.refundAmount) {
    const amt = (data.refundAmount).toLocaleString("es-EC", { style: "currency", currency: data.currency ?? "USD" });
    refundLine = `\n💳 *Reembolso parcial (${data.refundPct}%):* ${amt} en 3-5 días hábiles.`;
  } else {
    refundLine = `\n⚠️ Cancelación fuera del plazo — no aplica reembolso.`;
  }
  return (
    `❌ *Cita cancelada*\n\n` +
    `Hola ${data.patientName}, tu cita ha sido cancelada.\n\n` +
    `📋 *Servicio:* ${data.serviceName}\n` +
    `📅 *Fecha:* ${dt}\n` +
    refundLine + `\n\n` +
    `Para agendar una nueva cita visita: {PORTAL_URL}\n` +
    `_${data.organizationName}_`
  );
}

export function buildRescheduleMessage(
  data: BookingMessageData & { newScheduledAt: Date }
): string {
  const oldDt = formatDatetime(data.scheduledAt, data.timezone);
  const newDt = formatDatetime(data.newScheduledAt, data.timezone);
  return (
    `🔄 *Cita reprogramada*\n\n` +
    `Hola ${data.patientName}, tu cita ha sido reprogramada.\n\n` +
    `📋 *Servicio:* ${data.serviceName}\n` +
    `❌ *Fecha anterior:* ${oldDt}\n` +
    `✅ *Nueva fecha:* ${newDt}\n\n` +
    `_${data.organizationName}_`
  );
}

export function buildDoctorNewBookingMessage(
  data: BookingMessageData & { adminUrl: string }
): string {
  const dt = formatDatetime(data.scheduledAt, data.timezone);
  return (
    `🗓️ *Nueva cita confirmada*\n\n` +
    `📋 *Servicio:* ${data.serviceName}\n` +
    `👤 *Paciente:* ${data.patientName}\n` +
    `📞 *Teléfono:* ${data.patientPhone}\n` +
    `📅 *Fecha y hora:* ${dt}\n` +
    `⏱ *Duración:* ${data.durationMinutes} min\n\n` +
    `Ver en el panel: ${data.adminUrl}`
  );
}
