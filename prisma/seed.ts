import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { addMinutes } from "date-fns";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta DATABASE_URL en .env");

const adapter = new PrismaNeon({ connectionString });
const prisma  = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // 1. ORGANIZACIÓN
  const org = await prisma.organization.upsert({
    where:  { slug: "clinica-demo" },
    update: {},
    create: {
      slug:                  "clinica-demo",
      name:                  "Clínica Demo",
      timezone:              "America/Guayaquil",
      whatsappEnabled:       true,
      googleCalendarEnabled: false,
    },
  });
  console.log("✓ Organization:", org.slug);

  // 2. PROFESIONAL
  const doctor = await prisma.professional.upsert({
    where:  { id: "prof_demo_001" },
    update: {},
    create: {
      id:             "prof_demo_001",
      organizationId: org.id,
      name:           "Dr. Ana García",
      email:          "ana.garcia@clinica-demo.com",
      specialty:      "Medicina General",
      active:         true,
    },
  });
  console.log("✓ Professional:", doctor.name);

  // 3. SERVICIOS
  const consulta = await prisma.service.upsert({
    where:  { id: "svc_demo_001" },
    update: {},
    create: {
      id:              "svc_demo_001",
      organizationId:  org.id,
      professionalId:  doctor.id,
      name:            "Consulta General",
      description:     "Consulta médica general de 30 minutos",
      durationMinutes: 30,
      price:           25.0,
      currency:        "USD",
      active:          true,
    },
  });

  const seguimiento = await prisma.service.upsert({
    where:  { id: "svc_demo_002" },
    update: {},
    create: {
      id:              "svc_demo_002",
      organizationId:  org.id,
      professionalId:  doctor.id,
      name:            "Consulta de Seguimiento",
      description:     "Seguimiento de tratamiento - 15 minutos",
      durationMinutes: 15,
      price:           15.0,
      currency:        "USD",
      active:          true,
    },
  });
  console.log("✓ Services:", consulta.name, "|", seguimiento.name);

  // 4. HORARIOS: Lun-Vie 08:00-17:00, slots de 30 min
  const WORK_DAYS = [1, 2, 3, 4, 5];
  for (const day of WORK_DAYS) {
    await prisma.availabilityRule.upsert({
      where:  { id: `avail_demo_${day}` },
      update: {},
      create: {
        id:                  `avail_demo_${day}`,
        organizationId:      org.id,
        professionalId:      doctor.id,
        dayOfWeek:           day,
        startTime:           "08:00",
        endTime:             "17:00",
        slotDurationMinutes: 30,
        active:              true,
      },
    });
  }
  console.log("✓ Availability rules: Lun-Vie 08:00-17:00");

  // 5. BOOKING de prueba para mañana a las 09:00 ECT (= 14:00 UTC)
  // Booking usa startTime + endTime (no scheduledAt ni durationMinutes)
  const startTime = new Date();
  startTime.setDate(startTime.getDate() + 1);
  startTime.setHours(14, 0, 0, 0); // 09:00 ECT = 14:00 UTC
  const endTime = addMinutes(startTime, 30);

  await prisma.booking.upsert({
    where:  { id: "bk_demo_001" },
    update: {},
    create: {
      id:            "bk_demo_001",
      organizationId: org.id,
      professionalId: doctor.id,
      serviceId:      consulta.id,
      patientName:    "Juan Pérez",
      patientEmail:   "juan.perez@example.com",
      patientPhone:   "+593987654321",
      startTime,
      endTime,
      status:         "CONFIRMED",
      paymentStatus:  "PAID",
    },
  });
  console.log("✓ Demo booking creado para mañana 09:00 ECT");

  console.log("\n✅ Seed completado.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
