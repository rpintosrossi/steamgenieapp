/**
 * Crea varios servicios (work orders) en el Edificio Demo Completo
 * con fechas distintas para probar la UI mobile.
 * Uso: pnpm db:seed-demo-services
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import {
  PrismaClient,
  WorkOrderStatus,
  WorkOrderType,
  AssignmentStatus,
} from '@prisma/client';

config({ path: resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const BUILDING_NAME = 'Edificio Demo Completo';
const DEMO_PREFIX = 'Demo UI ·';

interface DemoServiceSpec {
  title: string;
  description: string;
  dayOffset: number | null;
  assignmentStatus: AssignmentStatus;
  workOrderStatus: WorkOrderStatus;
  type: WorkOrderType;
  floorName: string;
  zoneName: string;
  guestName?: string;
}

const DEMO_SERVICES: DemoServiceSpec[] = [
  {
    title: `${DEMO_PREFIX} Checkout Cocina (hace 7 días)`,
    description: 'Servicio vencido la semana pasada — prueba cómo se ve una fecha pasada.',
    dayOffset: -7,
    assignmentStatus: 'PENDING',
    workOrderStatus: 'ASSIGNED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta PB',
    zoneName: 'Cocina',
  },
  {
    title: `${DEMO_PREFIX} Aseo Baño PB (hace 2 días)`,
    description: 'Pedido adicional de limpieza de baño en planta baja.',
    dayOffset: -2,
    assignmentStatus: 'PENDING',
    workOrderStatus: 'ASSIGNED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta PB',
    zoneName: 'Baño',
  },
  {
    title: `${DEMO_PREFIX} Ayer — Habitación 1`,
    description: 'Servicio programado para ayer, pendiente de aceptar.',
    dayOffset: -1,
    assignmentStatus: 'PENDING',
    workOrderStatus: 'ASSIGNED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta PB',
    zoneName: 'Habitación 1',
  },
  {
    title: `${DEMO_PREFIX} Hoy — Cocina PB`,
    description: 'Limpieza programada para hoy.',
    dayOffset: 0,
    assignmentStatus: 'PENDING',
    workOrderStatus: 'ASSIGNED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta PB',
    zoneName: 'Cocina',
  },
  {
    title: `${DEMO_PREFIX} Limpieza checkout — Habitación 1 (hoy)`,
    description: 'Servicio automático por checkout de huésped (reserva demo).',
    dayOffset: 0,
    assignmentStatus: 'PENDING',
    workOrderStatus: 'ASSIGNED',
    type: 'CHECKOUT_CLEANING',
    floorName: 'Planta PB',
    zoneName: 'Habitación 1',
    guestName: 'Huésped Demo',
  },
  {
    title: `${DEMO_PREFIX} Hoy aceptado — Baño PB`,
    description: 'Ya aceptado para hoy — aparece en pestaña Aceptadas.',
    dayOffset: 0,
    assignmentStatus: 'ACCEPTED',
    workOrderStatus: 'ACCEPTED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta PB',
    zoneName: 'Baño',
  },
  {
    title: `${DEMO_PREFIX} Mañana — Habitación 2`,
    description: 'Checkout programado para mañana.',
    dayOffset: 1,
    assignmentStatus: 'PENDING',
    workOrderStatus: 'ASSIGNED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta PB',
    zoneName: 'Habitación 2',
  },
  {
    title: `${DEMO_PREFIX} +3 días — Planta 1 Cocina`,
    description: 'Servicio en planta 1 dentro de tres días.',
    dayOffset: 3,
    assignmentStatus: 'ACCEPTED',
    workOrderStatus: 'ACCEPTED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta 1',
    zoneName: 'Cocina',
  },
  {
    title: `${DEMO_PREFIX} Próxima semana — Planta 2`,
    description: 'Limpieza profunda programada para la semana que viene.',
    dayOffset: 7,
    assignmentStatus: 'PENDING',
    workOrderStatus: 'ASSIGNED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta 2',
    zoneName: 'Baño',
  },
  {
    title: `${DEMO_PREFIX} +14 días — Planta 3`,
    description: 'Servicio lejano en el calendario.',
    dayOffset: 14,
    assignmentStatus: 'PENDING',
    workOrderStatus: 'ASSIGNED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta 3',
    zoneName: 'Habitación 1',
  },
  {
    title: `${DEMO_PREFIX} Sin fecha programada`,
    description: 'Sin scheduledDate — debe mostrarse como "Sin fecha".',
    dayOffset: null,
    assignmentStatus: 'PENDING',
    workOrderStatus: 'ASSIGNED',
    type: 'ADDITIONAL_REQUEST',
    floorName: 'Planta PB',
    zoneName: 'Habitación 1',
  },
];

function utcDateFromOffset(dayOffset: number | null): Date | null {
  if (dayOffset === null) return null;
  const today = new Date();
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + dayOffset),
  );
}

async function main() {
  const adminDni = process.env.SEED_ADMIN_DNI ?? '12345678';
  const admin = await prisma.user.findFirst({
    where: { dni: adminDni, deletedAt: null },
    select: { id: true, fullName: true, dni: true },
  });
  if (!admin) {
    throw new Error(`Usuario con DNI ${adminDni} no encontrado. Ejecutá pnpm db:seed primero.`);
  }

  const building = await prisma.building.findFirst({
    where: { name: BUILDING_NAME, deletedAt: null },
    include: {
      floors: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      zones: { where: { deletedAt: null } },
    },
  });

  if (!building) {
    throw new Error(
      `Edificio "${BUILDING_NAME}" no encontrado. Ejecutá pnpm db:seed-building primero.`,
    );
  }

  let created = 0;
  let skipped = 0;

  for (const spec of DEMO_SERVICES) {
    const existing = await prisma.workOrder.findFirst({
      where: { buildingId: building.id, title: spec.title, deletedAt: null },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const floor = building.floors.find((f) => f.name === spec.floorName);
    if (!floor) {
      console.warn(`  ⚠ Piso no encontrado: ${spec.floorName} — omitiendo "${spec.title}"`);
      continue;
    }

    const zone = building.zones.find(
      (z) => z.floorId === floor.id && z.name === spec.zoneName,
    );
    if (!zone) {
      console.warn(`  ⚠ Zona no encontrada: ${spec.zoneName} — omitiendo "${spec.title}"`);
      continue;
    }

    let masterTasks = await prisma.task.findMany({
      where: {
        buildingId: building.id,
        zoneId: zone.id,
        deletedAt: null,
        isActive: true,
        ...(spec.type === 'CHECKOUT_CLEANING' ? { frequency: 'EVENTUAL' } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 3,
    });

    if (masterTasks.length === 0 && spec.type === 'CHECKOUT_CLEANING') {
      masterTasks = await prisma.task.findMany({
        where: { buildingId: building.id, zoneId: zone.id, deletedAt: null, isActive: true },
        orderBy: { createdAt: 'asc' },
        take: 3,
      });
    }

    if (masterTasks.length === 0) {
      console.warn(`  ⚠ Sin tareas maestras en ${spec.zoneName} — omitiendo "${spec.title}"`);
      continue;
    }

    const scheduledDate = utcDateFromOffset(spec.dayOffset);
    const deadlineAt = scheduledDate
      ? new Date(scheduledDate.getTime() + 2 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      let reservationId: string | null = null;

      if (spec.type === 'CHECKOUT_CLEANING') {
        const checkoutDay = scheduledDate ?? utcDateFromOffset(0)!;
        const checkoutAt = new Date(checkoutDay);
        checkoutAt.setUTCHours(11, 0, 0, 0);
        const checkinAt = new Date(checkoutAt);
        checkinAt.setUTCDate(checkinAt.getUTCDate() - 2);
        checkinAt.setUTCHours(15, 0, 0, 0);

        const reservation = await tx.reservation.create({
          data: {
            buildingId: building.id,
            floorId: floor.id,
            zoneId: zone.id,
            guestName: spec.guestName ?? 'Huésped Demo',
            checkinAt,
            checkoutAt,
            source: 'MANUAL',
          },
        });
        reservationId = reservation.id;
      }

      const workOrder = await tx.workOrder.create({
        data: {
          type: spec.type,
          reservationId,
          buildingId: building.id,
          floorId: floor.id,
          zoneId: zone.id,
          title: spec.title,
          description: spec.description,
          scheduledDate,
          deadlineAt,
          status: spec.workOrderStatus,
          createdById: admin.id,
        },
      });

      for (let i = 0; i < masterTasks.length; i++) {
        const task = masterTasks[i];
        await tx.workOrderTask.create({
          data: {
            workOrderId: workOrder.id,
            taskId: task.id,
            nameSnapshot: task.name,
            requiresPhotoSnapshot: task.requiresPhoto,
            allowsObservationSnapshot: task.allowsObservation,
            requiresRejectionReasonSnapshot: task.requiresRejectionReason,
            sortOrder: i,
          },
        });
      }

      await tx.workOrderAssignment.create({
        data: {
          workOrderId: workOrder.id,
          userId: admin.id,
          status: spec.assignmentStatus,
          respondedAt: spec.assignmentStatus === 'ACCEPTED' ? new Date() : null,
        },
      });
    });

    created++;
    const dateLabel =
      spec.dayOffset === null
        ? 'sin fecha'
        : spec.dayOffset === 0
          ? 'hoy'
          : spec.dayOffset === 1
            ? 'mañana'
            : spec.dayOffset < 0
              ? `${spec.dayOffset}d`
              : `+${spec.dayOffset}d`;
    console.log(
      `  ✓ ${spec.title} (${dateLabel}, ${spec.type === 'CHECKOUT_CLEANING' ? 'checkout' : 'pedido'}, ${spec.assignmentStatus === 'PENDING' ? 'pendiente' : 'aceptada'})`,
    );
  }

  console.log('');
  console.log('✅ Servicios demo listos');
  console.log(`   Edificio: ${BUILDING_NAME}`);
  console.log(`   Creados: ${created} · Omitidos (ya existían): ${skipped}`);
  console.log(`   Asignados a: ${admin.fullName} (DNI ${admin.dni})`);
  console.log('');
  console.log('En la app: seleccioná el edificio → Servicios / panel del inicio.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
