/**
 * apply-constraints.ts
 *
 * Applies raw SQL constraints that Prisma cannot express in schema.prisma.
 * Run automatically after every migrate dev / migrate deploy via the
 * db:migrate and db:deploy scripts in the root package.json.
 *
 * All statements are idempotent (guarded with IF NOT EXISTS).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Applying custom SQL constraints...');

  /**
   * task_executions — exactly one of (work_order_task_id, periodic_task_instance_id)
   * must be non-null. Prisma does not support CHECK constraints natively.
   */
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_task_execution_origin'
      ) THEN
        ALTER TABLE task_executions
          ADD CONSTRAINT chk_task_execution_origin
          CHECK (
            ("workOrderTaskId" IS NOT NULL AND "periodicTaskInstanceId" IS NULL) OR
            ("workOrderTaskId" IS NULL     AND "periodicTaskInstanceId" IS NOT NULL)
          );
        RAISE NOTICE 'chk_task_execution_origin: added';
      ELSE
        RAISE NOTICE 'chk_task_execution_origin: already exists, skipped';
      END IF;
    END $$;
  `);

  console.log('✅ Custom constraints applied.');
}

main()
  .catch((e) => {
    console.error('❌ apply-constraints failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
