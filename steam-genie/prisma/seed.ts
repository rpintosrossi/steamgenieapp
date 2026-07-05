/**
 * Seed inicial — Steam Genie
 *
 * Crea:
 * 1. Roles del sistema (admin, manager, cleaner, client, provider)
 * 2. Permisos de módulos por rol
 * 3. Usuario admin inicial con DNI y contraseña configurables por env
 *
 * Variables requeridas en .env:
 *   SEED_ADMIN_DNI
 *   SEED_ADMIN_PASSWORD
 *   SEED_ADMIN_NAME
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  ALL_APP_MODULES,
  APP_MODULES,
  type AppModuleKey,
} from '@steam-genie/shared-constants';

const prisma = new PrismaClient();

const ROLES = [
  { name: 'admin', description: 'Administrador del sistema. Acceso total.' },
  { name: 'manager', description: 'Encargado de edificio. Puede iniciar cualquier servicio en sus edificios.' },
  { name: 'cleaner', description: 'Limpiador. Solo puede iniciar WOs donde tiene assignment ACCEPTED.' },
  { name: 'client', description: 'Cliente. Acceso a reportes y estado de sus espacios. (Fase 2)' },
  { name: 'provider', description: 'Proveedor externo de servicios. (Fase 2)' },
  { name: 'stock', description: 'Encargado de stock. Gestión de inventario y proveedores.' },
] as const;

const ROLE_MODULES: Record<string, AppModuleKey[]> = {
  admin: [...ALL_APP_MODULES],
  manager: [
    APP_MODULES.DASHBOARD,
    APP_MODULES.BUILDINGS,
    APP_MODULES.TASKS,
    APP_MODULES.RESERVAS,
    APP_MODULES.SERVICIOS_EVENTUALES,
    APP_MODULES.TRABAJOS_RECURRENTES,
    APP_MODULES.PRESENCIA,
    APP_MODULES.STOCK,
    APP_MODULES.STOCK_MONITORING,
    APP_MODULES.STOCK_SHIPMENTS,
  ],
  cleaner: [],
  client: [],
  provider: [],
  stock: [APP_MODULES.DASHBOARD, APP_MODULES.STOCK],
};

async function syncRolePermissions(roleId: string, modules: AppModuleKey[]) {
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  if (modules.length === 0) return;
  await prisma.rolePermission.createMany({
    data: modules.map((moduleKey) => ({ roleId, moduleKey })),
  });
}

async function main() {
  console.log('🌱 Starting seed...');

  // ── Roles ──────────────────────────────────────────────────────────────────
  const roleMap = new Map<string, string>();

  for (const roleData of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: {
        description: roleData.description,
        isSystem: true,
      },
      create: {
        ...roleData,
        isSystem: true,
      },
    });
    roleMap.set(role.name, role.id);
    await syncRolePermissions(role.id, ROLE_MODULES[role.name] ?? []);
    console.log(`  ✓ Role: ${role.name} (${(ROLE_MODULES[role.name] ?? []).length} módulos)`);
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

  const adminRoleId = roleMap.get('admin');
  if (!adminRoleId) throw new Error('Admin role not found after seed.');

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

  // ── Stock demo ──────────────────────────────────────────────────────────────
  const STOCK_CATEGORIES = [
    { name: 'Limpieza', sortOrder: 0 },
    { name: 'Higiene', sortOrder: 1 },
    { name: 'Descartables', sortOrder: 2 },
  ];

  const categoryIds = new Map<string, string>();
  for (const cat of STOCK_CATEGORIES) {
    const existing = await prisma.stockCategory.findFirst({
      where: { name: cat.name, deletedAt: null },
    });
    const category =
      existing ??
      (await prisma.stockCategory.create({
        data: { name: cat.name, sortOrder: cat.sortOrder, isActive: true },
      }));
    categoryIds.set(cat.name, category.id);
  }

  const supplier =
    (await prisma.stockSupplier.findFirst({
      where: { name: 'Distribuidora Central', deletedAt: null },
    })) ??
    (await prisma.stockSupplier.create({
      data: {
        name: 'Distribuidora Central',
        contactEmail: 'ventas@distribuidora.com',
        contactPhone: '+54 11 4000-0000',
        isActive: true,
      },
    }));

  const DEMO_PRODUCTS = [
    { name: 'Detergente multiuso', category: 'Limpieza', quantity: 24, minQuantity: 10, unitType: 'LITER' as const },
    { name: 'Escoba industrial', category: 'Limpieza', quantity: 8, minQuantity: 5, unitType: 'UNIT' as const },
    { name: 'Jabón líquido', category: 'Higiene', quantity: 3, minQuantity: 5, unitType: 'LITER' as const },
    { name: 'Papel higiénico', category: 'Descartables', quantity: 0, minQuantity: 20, unitType: 'PACK' as const },
    { name: 'Bolsas de residuos', category: 'Descartables', quantity: 150, minQuantity: 50, unitType: 'PACK' as const },
  ];

  for (const item of DEMO_PRODUCTS) {
    const categoryId = categoryIds.get(item.category);
    if (!categoryId) continue;

    const existing = await prisma.stockProduct.findFirst({
      where: { name: item.name, deletedAt: null },
    });
    if (!existing) {
      await prisma.stockProduct.create({
        data: {
          name: item.name,
          categoryId,
          supplierId: supplier.id,
          quantity: item.quantity,
          minQuantity: item.minQuantity,
          unitType: item.unitType,
          isActive: true,
        },
      });
      console.log(`  ✓ Producto stock: ${item.name}`);
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
