/**
 * Seed inicial — Steam Genie
 *
 * Crea:
 * 1. Roles del sistema (admin, manager, cleaner, client, provider)
 * 2. Usuario admin inicial con DNI y contraseña configurables por env
 *
 * Variables requeridas en .env:
 *   SEED_ADMIN_DNI
 *   SEED_ADMIN_PASSWORD
 *   SEED_ADMIN_NAME
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ROLES = [
  { name: 'admin', description: 'Administrador del sistema. Acceso total.' },
  { name: 'manager', description: 'Encargado de edificio. Puede iniciar cualquier servicio en sus edificios.' },
  { name: 'cleaner', description: 'Limpiador. Solo puede iniciar WOs donde tiene assignment ACCEPTED.' },
  { name: 'client', description: 'Cliente. Acceso a reportes y estado de sus espacios. (Fase 2)' },
  { name: 'provider', description: 'Proveedor externo de servicios. (Fase 2)' },
] as const;

async function main() {
  console.log('🌱 Starting seed...');

  // ── Roles ──────────────────────────────────────────────────────────────────
  const roleMap = new Map<string, string>();

  for (const roleData of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: { description: roleData.description },
      create: roleData,
    });
    roleMap.set(role.name, role.id);
    console.log(`  ✓ Role: ${role.name}`);
  }

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminDni = process.env.SEED_ADMIN_DNI;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME ?? 'Administrador Principal';

  if (!adminDni || !adminPassword) {
    throw new Error(
      'Missing env vars: SEED_ADMIN_DNI and SEED_ADMIN_PASSWORD are required.',
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: { dni: adminDni },
    update: {
      fullName: adminName,
      passwordHash,
      primaryRole: 'admin',
      isActive: true,
    },
    create: {
      dni: adminDni,
      fullName: adminName,
      passwordHash,
      primaryRole: 'admin',
      isActive: true,
    },
  });

  console.log(`  ✓ Admin user: ${adminUser.fullName} (DNI: ${adminUser.dni})`);

  // Global admin role (buildingId = null = global)
  const adminRoleId = roleMap.get('admin');
  if (!adminRoleId) throw new Error('Admin role not found after seed.');

  // Global admin role (buildingId = null = global).
  // PostgreSQL treats NULLs as distinct in unique indexes, so we use
  // findFirst + conditional create to keep this idempotent.
  const existingAdminRole = await prisma.userBuildingRole.findFirst({
    where: { userId: adminUser.id, buildingId: null, roleId: adminRoleId },
  });

  if (!existingAdminRole) {
    await prisma.userBuildingRole.create({
      data: {
        userId: adminUser.id,
        buildingId: null,
        roleId: adminRoleId,
        grantedById: adminUser.id,
      },
    });
  }

  console.log(`  ✓ Global admin role assigned`);

  // ── Motivos de no realización de tareas ─────────────────────────────────────
  const TASK_NOT_DONE_REASONS = [
    'Falta de insumos',
    'Acceso restringido',
    'No corresponde / daño preexistente',
    'Falta de tiempo en el turno',
  ];

  for (const text of TASK_NOT_DONE_REASONS) {
    const existing = await prisma.rejectionReason.findFirst({
      where: { type: 'TASK_NOT_DONE', text, deletedAt: null },
    });
    if (!existing) {
      await prisma.rejectionReason.create({
        data: { type: 'TASK_NOT_DONE', text, isActive: true },
      });
      console.log(`  ✓ Motivo tarea: ${text}`);
    }
  }

  console.log('✅ Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
