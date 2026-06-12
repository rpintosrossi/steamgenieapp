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

## 9. Deploy (Railway — API)

### Requisitos previos

- Cuenta en [Railway](https://railway.app)
- Base de datos **Neon** (o Postgres en Railway) con `DATABASE_URL` (pooler) y `DIRECT_URL` (directo)
- Bucket **Cloudflare R2** con variables `S3_*` (ver `.env.example`)

### 1. Subir código

El monorepo vive en `steam-genie/`. Si el repo git es `APP-SG`, en Railway → **Settings → Root Directory** = `steam-genie`.

### 2. Crear servicio API

1. **New Project** → **Deploy from GitHub** → repo `steamgenieapp`
2. Railway detecta `Dockerfile` y `railway.toml`
3. Generar dominio público: **Settings → Networking → Generate Domain**

### 3. Variables de entorno (Railway → Variables)

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | URL pooler Neon (`*-pooler*`) |
| `DIRECT_URL` | URL directa Neon (sin `-pooler`) |
| `JWT_ACCESS_SECRET` | secreto ≥ 32 chars |
| `JWT_REFRESH_SECRET` | secreto ≥ 32 chars |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `90d` |
| `API_URL` | `https://<tu-dominio>.up.railway.app` |
| `ALLOWED_ORIGINS` | URL del admin (Vercel) + localhost si hace falta |
| `SKIP_GPS_VALIDATION` | `false` en producción |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | nombre del bucket |
| `S3_ACCESS_KEY_ID` | clave R2 |
| `S3_SECRET_ACCESS_KEY` | secreto R2 |
| `S3_PUBLIC_BASE_URL` | URL pública del bucket |

> **No** commitear `.env`. Copiar valores desde tu `.env` local.

### 4. Migraciones (automáticas)

`railway.toml` ejecuta antes de cada deploy:

```bash
pnpm db:deploy
```

Primera vez, correr seed manualmente (Railway → service → **Shell** o CLI):

```bash
pnpm db:seed
```

### 5. Verificar

```bash
curl https://<tu-dominio>.up.railway.app/health
# → {"status":"ok","timestamp":"..."}
```

### CLI (opcional)

```bash
cd steam-genie
railway login
railway link          # vincular proyecto
railway up            # deploy
railway variables set DATABASE_URL=...
```

Ver `ARQUITECTURA.md` para el diagrama completo y decisiones de diseño.

---

## 10. Deploy (Vercel — Web Admin)

### 1. Importar proyecto

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → `steamgenieapp`
2. **Root Directory** = `steam-genie/apps/web`
3. Framework: **Next.js** (detectado automáticamente)
4. `vercel.json` en esa carpeta ya define install/build para el monorepo pnpm

### 2. Variables de entorno

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<tu-api>.up.railway.app` |

> `NEXT_PUBLIC_WS_URL` no se usa aún en el admin; podés omitirla.

### 3. Deploy

Click **Deploy**. Al terminar copiá la URL (ej. `https://steam-genie-xxx.vercel.app`).

### 4. CORS en Railway

En Railway → Variables → actualizá `ALLOWED_ORIGINS`:

```
https://<tu-admin>.vercel.app,http://localhost:3000
```

Redeploy de la API si hace falta (Railway suele recargar vars al instante).

### 5. Verificar

1. Abrí la URL de Vercel → debería redirigir a `/login`
2. Login admin: DNI `12345678` / pass `01012000` (si corriste seed en Neon)
