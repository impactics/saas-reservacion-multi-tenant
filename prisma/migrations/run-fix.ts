/**
 * run-fix.ts  — usa el driver pg estándar, compatible con cualquier versión
 * Uso: npx tsx prisma/migrations/run-fix.ts
 */
import { readFileSync } from 'fs';
import { join }         from 'path';
import { Client }       from 'pg';
import * as dotenv      from 'dotenv';

// Intentar .env.local primero, luego .env
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL no encontrado en .env.local ni en .env');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('🔧 Conectado a Neon vía pg');

  const sqlFile = readFileSync(
    join(process.cwd(), 'prisma/migrations/fix_bookings_table.sql'),
    'utf-8'
  );

  // Ejecutar todo el archivo como una sola transacción
  console.log('🚀 Ejecutando migración...\n');

  try {
    await client.query('BEGIN');
    await client.query(sqlFile);
    await client.query('COMMIT');
    console.log('✅ Migración aplicada correctamente.');
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error — se hizo ROLLBACK:', message);
    process.exit(1);
  } finally {
    await client.end();
  }

  console.log('\n🎉 bookings recreada. Columnas correctas:');
  console.log('   start_time, end_time, notes, total_amount,');
  console.log('   reschedule_count, deposit_amount, payment_method...');
  console.log('\nAhora corre: git commit --allow-empty -m "fix: db synced" && git push');
}

main();
