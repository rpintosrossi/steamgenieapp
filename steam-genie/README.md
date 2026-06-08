# Steam Genie — Monorepo

Plataforma de gestión de servicios de limpieza.  
Stack: **NestJS 10** (API) · **Next.js 14** (web admin) · **Expo + React Native** (mobile) · **Prisma 5 + PostgreSQL 16** · **Redis 7 + BullMQ**

---

## Requisitos previos

- Node.js ≥ 20
- pnpm 9.x (`npm install -g pnpm@9`)
- Docker + Docker Compose

---

## 1. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con valores reales (mínimo: `SEED_ADMIN_DNI`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`).

---

## 2. Levantar base de datos y Redis

```bash
docker compose up -d
```

Esperar que los contenedores `postgres` y `redis` estén healthy.

---

## 3. Instalar dependencias

```bash
pnpm install
```

---

## 4. Ejecutar migraciones y seed

```bash
# Compilar los packages compartidos (requerido antes del primer dev)
pnpm --filter "./packages/*" build

# Crear y aplicar la migración inicial + CHECK constraints
pnpm db:migrate

# Cargar datos iniciales (roles + admin)
pnpm db:seed
```

> `pnpm db:migrate` aplica automáticamente el CHECK constraint de `task_executions`  
> a través de `prisma/apply-constraints.ts` (idempotente, seguro de re-ejecutar).  
> `pnpm db:deploy` hace lo mismo para entornos de producción.

---

## 5. Desarrollo local

```bash
# Todos los apps en paralelo (turbo)
pnpm dev

# Solo API
pnpm --filter @steam-genie/api dev

# Solo web
pnpm --filter @steam-genie/web dev

# Solo mobile
pnpm --filter @steam-genie/mobile dev
```

---

## 6. Estructura del monorepo

```
steam-genie/
├── apps/
│   ├── api/          NestJS backend (puerto 4000)
│   ├── web/          Next.js admin panel (puerto 3000)
│   └── mobile/       Expo app (iOS / Android)
├── packages/
│   ├── shared-constants/   Roles, frecuencias, estados, eventos
│   ├── shared-types/       TypeScript interfaces compartidas
│   └── shared-validators/  Schemas Zod reutilizables
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

---

## 7. Scripts raíz

| Comando | Descripción |
|---|---|
| `pnpm dev` | Dev en todos los workspaces |
| `pnpm build` | Build de producción |
| `pnpm lint` | Lint de todos los workspaces |
| `pnpm typecheck` | TypeScript check en todos |
| `pnpm db:migrate` | `prisma migrate dev` + apply-constraints (desarrollo) |
| `pnpm db:deploy` | `prisma migrate deploy` + apply-constraints (producción) |
| `pnpm db:generate` | `prisma generate` |
| `pnpm db:seed` | seed inicial (roles + admin, idempotente) |
| `pnpm db:studio` | Prisma Studio |

---

## 8. Decisiones de arquitectura clave

- **Autorización**: todos los guards verifican `user_building_roles`. El campo `primaryRole` en `User` es denormalizado (solo para display). **Nunca** se usa solo `primaryRole` para autorizar.
- **task_executions**: usa `workOrderTaskId` (para tareas de work orders) o `periodicTaskInstanceId` (para tareas periódicas). Nunca `taskId` directamente.
- **EVENTUAL tasks**: solo existen en el contexto de work orders. No deben aparecer en endpoints de tareas periódicas.
- **Work Orders**: al crear una WO, se generan snapshots en `work_order_tasks` (copias inmutables de las tareas EVENTUAL de la zona/subzona).
- **Offline-first (mobile)**: operaciones se encolan en `sync_queue` (SQLite) y se procesan con `SyncManager` cuando hay conexión. Idempotencia garantizada por `clientOperationId`.

---

## 9. Deploy (Railway)

1. Crear servicios en Railway: PostgreSQL, Redis, y el API web service.
2. Configurar variables de entorno en Railway desde `.env.example`.
3. Comando de release (Railway → Settings → Deploy → Release Command):
   ```bash
   # Primera vez (incluye seed):
   pnpm db:deploy && pnpm db:seed
   # Deploys posteriores (solo migraciones):
   pnpm db:deploy
   ```
   El seed es idempotente: usa upsert para roles/admin y `IF NOT EXISTS` para constraints.
4. Storage: Cloudflare R2 bucket + API keys en las variables `R2_*`.

Ver `ARQUITECTURA.md` para el diagrama completo y decisiones de diseño.
