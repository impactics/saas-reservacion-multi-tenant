import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. ORGANIZACIÓN
  const org = await prisma.organization.upsert({
    where: { slug: "dra-maria-belen" },
    update: {},
    create: {
      slug:                  "dra-maria-belen",
      name:                  "Dra. María Belén Villamar",
      description:           "Dermatóloga clínica y estética en Portoviejo, Manabí.",
      timezone:              "America/Guayaquil",
      whatsappEnabled:       true,
      googleCalendarEnabled: false,
      phoneWhatsapp:         "+593990000000", // ← reemplazar con número real
    },
  });
  console.log("✓ Organización:", org.slug);

  // 2. PROFESIONAL
  // El teléfono del profesional se gestiona en Organization.phoneWhatsapp;
  // el modelo Professional no tiene campo phone.
  const dra = await prisma.professional.upsert({
    where:  { id: "prof_dra_maria_belen" },
    update: {},
    create: {
      id:             "prof_dra_maria_belen",
      organizationId: org.id,
      name:           "Dra. María Belén Villamar",
      email:          "dra.mariabelen@email.com",
      specialty:      "Dermatología",
      active:         true,
    },
  });
  console.log("✓ Profesional:", dra.name);

  // 3. SERVICIOS
  const servicios = [
    {
      id:              "svc_dra_mb_001",
      name:            "Consulta dermatológica general",
      description:     "Diagnóstico y tratamiento de afecciones de la piel.",
      durationMinutes: 30,
      price:           35.0,
    },
    {
      id:              "svc_dra_mb_002",
      name:            "Tratamiento facial estético",
      description:     "Botox, rellenos y rejuvenecimiento facial.",
      durationMinutes: 45,
      price:           80.0,
    },
    {
      id:              "svc_dra_mb_003",
      name:            "Consulta dermatología pediátrica",
      description:     "Atención especializada para pacientes de 0 a 14 años.",
      durationMinutes: 30,
      price:           30.0,
    },
    {
      id:              "svc_dra_mb_004",
      name:            "Cirugía dermatológica menor",
      description:     "Extirpación de lunares, quistes y lesiones benignas.",
      durationMinutes: 60,
      price:           120.0,
    },
  ];

  for (const s of servicios) {
    await prisma.service.upsert({
      where:  { id: s.id },
      update: {},
      create: {
        ...s,
        organizationId: org.id,
        professionalId: dra.id,
        currency:       "USD",
        active:         true,
      },
    });
  }
  console.log("✓ Servicios:", servicios.length);

  // 4. HORARIOS — Lun a Vie 08:00-17:00 | Sáb 09:00-13:00, slots 30 min
  const reglas = [
    { day: 1, start: "08:00", end: "17:00" },
    { day: 2, start: "08:00", end: "17:00" },
    { day: 3, start: "08:00", end: "17:00" },
    { day: 4, start: "08:00", end: "17:00" },
    { day: 5, start: "08:00", end: "17:00" },
    { day: 6, start: "09:00", end: "13:00" },
  ];

  for (const r of reglas) {
    await prisma.availabilityRule.upsert({
      where:  { id: `avail_dra_mb_${r.day}` },
      update: {},
      create: {
        id:                 `avail_dra_mb_${r.day}`,
        organizationId:     org.id,
        professionalId:     dra.id,
        dayOfWeek:          r.day,
        startTime:          r.start,
        endTime:            r.end,
        slotDurationMinutes: 30,
        active:             true,
      },
    });
  }
  console.log("✓ Horarios: Lun-Vie 08:00-17:00 | Sáb 09:00-13:00");

  console.log("\n✅ Dra. María Belén lista.");
  console.log("   SaaS:      http://localhost:3000/dra-maria-belen");
  console.log("   Ecommerce: http://localhost:3001");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
