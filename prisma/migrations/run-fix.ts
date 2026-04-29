/**
 * run-fix.ts
 * Ejecuta el SQL de fix_bookings_table.sql contra Neon
 * Uso: npx tsx prisma/migrations/run-fix.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Cargar variables de entorno desde .env.local
dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL no encontrado en .env.local');
  process.exit(1);
}

async function main() {
  console.log('🔧 Conectando a Neon...');
  const sql = neon(DATABASE_URL!);

  const sqlFile = readFileSync(
    join(process.cwd(), 'prisma/migrations/fix_bookings_table.sql'),
    'utf-8'
  );

  console.log('🚀 Ejecutando migración...');

  // Ejecutar cada statement por separado
  const statements = sqlFile
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      await sql(statement);
      console.log('✅', statement.split('\n')[0].substring(0, 60) + '...');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Ignorar errores de "already exists" o "does not exist"
      if (message.includes('already exists') || message.includes('does not exist')) {
        console.log('⚠️  Skip (ya existe/no existe):', message.substring(0, 80));
      } else {
        console.error('❌ Error en statement:', statement.substring(0, 100));
        console.error('   Detalle:', message);
      }
    }
  }

  console.log('\n🎉 Migración completada. Verifica en Neon que bookings tenga:');
  console.log('   start_time, end_time, notes, total_amount, reschedule_count...');
}

main();
