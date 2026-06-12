/**
 * Crea una orden de trabajo de prueba con tareas asignadas al admin.
 * Uso: pnpm db:seed-demo-wo
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient, WorkOrderStatus, WorkOrderType } from '@prisma/client';

config({ path: resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const DEMO_REJECTION_REASONS = [
  { type: 'TASK_NOT_DONE' as const, text: 'Falta de insumos' },
  { type: 'TASK_NOT_DONE' as const, text: 'Acceso restringido' },
  { type: 'TASK_NOT_DONE' as const, text: 'Daño preexistente / no corresponde' },
];

const DEMO_TASKS = [
  {
    name: 'Limpiar baño principal',
    requiresPhoto: true,
    allowsObservation: true,
    requiresRejectionReason: false,
  },
  {
    name: 'Aspirar living y pasillos',
    requiresPhoto: false,
    allowsObservation: true,
    requiresRejectionReason: false,
  },
  {
    name: 'Reponer amenities (toallas y jabón)',
    requiresPhoto: false,
    allowsObservation: false,
    requiresRejectionReason: true,
  },
];

async function main() {
  const adminDni = process.env.SEED_ADMIN_DNI ?? '12345678';
  const admin = await prisma.user.findFirst({
    where: { dni: adminDni, deletedAt: null },
    select: { id: true, fullName: true, dni: true },
  });
  if (!admin) {
    throw new Error(`Usuario admin con DNI ${adminDni} no encontrado. Ejecutá pnpm db:seed primero.`);
  }

  for (const reason of DEMO_REJECTION_REASONS) {
    const existing = await prisma.rejectionReason.findFirst({
      where: { type: reason.type, text: reason.text, deletedAt: null },
    });
    if (!existing) {
      await prisma.rejectionReason.create({ data: reason });
      console.log(`  ✓ Motivo de rechazo: ${reason.text}`);
    }
  }

  let building = await prisma.building.findFirst({
    where: { isActive: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      floors: { where: { deletedAt: null }, take: 1, orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!building) {
    building = await prisma.building.create({
      data: {
        name: 'Edificio Demo Steam Genie',
        address: 'Calle de prueba 123',
        city: 'Buenos Aires',
        latitude: -34.6037,
        longitude: -58.3816,
        gpsRadiusM: 5000,
        isActive: true,
      },
      include: {
        floors: true,
      },
    });
    console.log(`  ✓ Edificio creado: ${building.name}`);
  }

  let floor = building.floors[0];
  if (!floor) {
    floor = await prisma.floor.create({
      data: {
        buildingId: building.id,
        name: 'Planta Baja',
        sortOrder: 0,
      },
    });
    console.log(`  ✓ Piso creado: ${floor.name}`);
  }

  let zone = await prisma.zone.findFirst({
    where: { buildingId: building.id, floorId: floor.id, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!zone) {
    zone = await prisma.zone.create({
      data: {
        buildingId: building.id,
        floorId: floor.id,
        name: 'Departamento 1A',
      },
    });
    console.log(`  ✓ Zona creada: ${zone.name}`);
  }

  const today = new Date();
  const scheduledDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  const result = await prisma.$transaction(async (tx) => {
    const masterTasks = [];
    for (const spec of DEMO_TASKS) {
      const existing = await tx.task.findFirst({
        where: {
          buildingId: building!.id,
          zoneId: zone!.id,
          name: spec.name,
          deletedAt: null,
        },
      });
      const task =
        existing ??
        (await tx.task.create({
          data: {
            buildingId: building!.id,
            zoneId: zone!.id,
            name: spec.name,
            frequency: 'EVENTUAL',
            startDate: scheduledDate,
            requiresPhoto: spec.requiresPhoto,
            allowsObservation: spec.allowsObservation,
            requiresRejectionReason: spec.requiresRejectionReason,
            isActive: true,
          },
        }));
      masterTasks.push(task);
    }

    const workOrder = await tx.workOrder.create({
      data: {
        type: WorkOrderType.ADDITIONAL_REQUEST,
        buildingId: building!.id,
        floorId: floor!.id,
        zoneId: zone!.id,
        title: `Servicio de prueba – ${zone!.name}`,
        description: 'Orden creada automáticamente para probar fichaje, checklist y fotos.',
        scheduledDate,
        deadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: WorkOrderStatus.ASSIGNED,
        createdById: admin.id,
      },
    });

    for (let i = 0; i < masterTasks.length; i++) {
      const task = masterTasks[i];
      const spec = DEMO_TASKS[i];
      await tx.workOrderTask.create({
        data: {
          workOrderId: workOrder.id,
          taskId: task.id,
          nameSnapshot: spec.name,
          requiresPhotoSnapshot: spec.requiresPhoto,
          allowsObservationSnapshot: spec.allowsObservation,
          requiresRejectionReasonSnapshot: spec.requiresRejectionReason,
          sortOrder: i,
        },
      });
    }

    await tx.workOrderAssignment.create({
      data: {
        workOrderId: workOrder.id,
        userId: admin.id,
        status: 'PENDING',
      },
    });

    return { workOrder, taskCount: masterTasks.length };
  });

  console.log('');
  console.log('✅ Orden de trabajo de prueba creada');
  console.log(`   Edificio: ${building.name} (${building.id})`);
  console.log(`   Orden: ${result.workOrder.title}`);
  console.log(`   ID: ${result.workOrder.id}`);
  console.log(`   Estado: ASSIGNED (pendiente de aceptar en la app)`);
  console.log(`   Tareas: ${result.taskCount}`);
  console.log(`   Asignada a: ${admin.fullName} (DNI ${admin.dni})`);
  console.log('');
  console.log('En la app mobile:');
  console.log('  1. Seleccioná el edificio → Fichá entrada');
  console.log('  2. Servicios → abrí la orden → Aceptar → Iniciar');
  console.log('  3. Checklist → completá las tareas');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
