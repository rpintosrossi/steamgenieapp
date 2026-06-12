/**
 * Crea un edificio demo con plantas, zonas, subzonas y tareas.
 * Uso: pnpm db:seed-building
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient, TaskFrequency } from '@prisma/client';

config({ path: resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const BUILDING_NAME = 'Edificio Demo Completo';

const FLOORS = [
  { name: 'Planta PB', sortOrder: 0 },
  { name: 'Planta 1', sortOrder: 1 },
  { name: 'Planta 2', sortOrder: 2 },
  { name: 'Planta 3', sortOrder: 3 },
] as const;

const ZONES = ['Cocina', 'Baño', 'Habitación 1', 'Habitación 2'] as const;

const SUBZONES_BY_ZONE: Record<(typeof ZONES)[number], string[]> = {
  Cocina: ['Bacha', 'Horno'],
  Baño: ['Inodoro', 'Bañera'],
  'Habitación 1': ['Cama', 'Placard'],
  'Habitación 2': ['Cama', 'Placard'],
};

const TASKS_BY_SUBZONE: Record<string, { name: string; requiresPhoto?: boolean }[]> = {
  Bacha: [
    { name: 'Limpiar y desinfectar bacha', requiresPhoto: true },
    { name: 'Pulir grifería y desagüe' },
  ],
  Horno: [
    { name: 'Limpiar interior del horno', requiresPhoto: true },
    { name: 'Limpiar puerta y panel exterior' },
  ],
  Inodoro: [
    { name: 'Limpiar y desinfectar inodoro', requiresPhoto: true },
    { name: 'Reponer papel higiénico' },
  ],
  Bañera: [
    { name: 'Limpiar y desinfectar bañera', requiresPhoto: true },
    { name: 'Limpiar mampara / cortina' },
  ],
  Cama: [
    { name: 'Cambiar ropa de cama', requiresPhoto: true },
    { name: 'Aspirar colchón y almohadas' },
  ],
  Placard: [
    { name: 'Limpiar interior del placard' },
    { name: 'Aspirar piso del placard', requiresPhoto: true },
  ],
};

async function main() {
  const today = new Date();
  const startDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  let building = await prisma.building.findFirst({
    where: { name: BUILDING_NAME, deletedAt: null },
  });

  if (!building) {
    building = await prisma.building.create({
      data: {
        name: BUILDING_NAME,
        address: 'Av. Demo 1000',
        city: 'Buenos Aires',
        province: 'CABA',
        latitude: -34.6037,
        longitude: -58.3816,
        gpsRadiusM: 5000,
        isActive: true,
      },
    });
    console.log(`  ✓ Edificio creado: ${building.name}`);
  } else {
    console.log(`  · Edificio existente: ${building.name} (${building.id})`);
  }

  let floorsCreated = 0;
  let zonesCreated = 0;
  let subzonesCreated = 0;
  let tasksCreated = 0;

  for (const floorSpec of FLOORS) {
    let floor = await prisma.floor.findFirst({
      where: { buildingId: building.id, name: floorSpec.name, deletedAt: null },
    });
    if (!floor) {
      floor = await prisma.floor.create({
        data: {
          buildingId: building.id,
          name: floorSpec.name,
          sortOrder: floorSpec.sortOrder,
        },
      });
      floorsCreated++;
    }

    for (const zoneName of ZONES) {
      let zone = await prisma.zone.findFirst({
        where: { floorId: floor.id, name: zoneName, deletedAt: null },
      });
      if (!zone) {
        zone = await prisma.zone.create({
          data: {
            buildingId: building.id,
            floorId: floor.id,
            name: zoneName,
          },
        });
        zonesCreated++;
      }

      for (const subzoneName of SUBZONES_BY_ZONE[zoneName]) {
        let subzone = await prisma.subzone.findFirst({
          where: { zoneId: zone.id, name: subzoneName, deletedAt: null },
        });
        if (!subzone) {
          subzone = await prisma.subzone.create({
            data: {
              buildingId: building.id,
              zoneId: zone.id,
              name: subzoneName,
            },
          });
          subzonesCreated++;
        }

        const taskSpecs = TASKS_BY_SUBZONE[subzoneName] ?? [
          { name: `Limpiar ${subzoneName}` },
        ];

        for (const taskSpec of taskSpecs) {
          const existingTask = await prisma.task.findFirst({
            where: {
              buildingId: building.id,
              zoneId: zone.id,
              subzoneId: subzone.id,
              name: taskSpec.name,
              deletedAt: null,
            },
          });
          if (existingTask) continue;

          await prisma.task.create({
            data: {
              buildingId: building.id,
              zoneId: zone.id,
              subzoneId: subzone.id,
              name: taskSpec.name,
              frequency: TaskFrequency.DAILY,
              startDate,
              requiresPhoto: taskSpec.requiresPhoto ?? false,
              allowsObservation: true,
              requiresRejectionReason: false,
              isActive: true,
            },
          });
          tasksCreated++;
        }
      }
    }
  }

  console.log('');
  console.log('✅ Edificio demo listo');
  console.log(`   Nombre: ${BUILDING_NAME}`);
  console.log(`   ID: ${building.id}`);
  console.log(`   Plantas: ${FLOORS.length} (${floorsCreated} nuevas)`);
  console.log(`   Zonas por planta: ${ZONES.join(', ')}`);
  console.log(`   Zonas creadas ahora: ${zonesCreated}`);
  console.log(`   Subzonas creadas ahora: ${subzonesCreated}`);
  console.log(`   Tareas creadas ahora: ${tasksCreated}`);
  console.log('');
  console.log('En la app: seleccioná este edificio → fichá entrada → verás tareas periódicas.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
