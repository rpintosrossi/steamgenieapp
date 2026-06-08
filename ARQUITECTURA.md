# Steam Genie — Arquitectura General del Sistema
> Documento de arquitectura técnica v1.2 · Junio 2026 · Revisión 03/06/2026

---

## 1. Arquitectura General del Sistema

El sistema se compone de tres capas de presentación y una capa de backend unificada:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENTES                                      │
│                                                                        │
│   [Expo React Native]          [Next.js Web Admin]                    │
│   - Android / iOS              - Responsive                           │
│   - Offline-first SQLite       - SSR + CSR                            │
│   - Push notifications         - WebSocket client                     │
└───────────────────┬──────────────────────────┬───────────────────────┘
                    │  HTTPS / REST            │  HTTPS / WS
                    ▼                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     API LAYER (NestJS + TypeScript)                   │
│                                                                        │
│   REST Controllers  │  WebSocket Gateway  │  Inbound Webhook Handler  │
│   ─────────────────────────────────────────────────────────────────  │
│   Auth · Users · Buildings · Attendance · WorkOrders · Tasks          │
│   ServiceExecution · Sync · Reservations · Reports · Notifications    │
└──────┬────────────────────┬─────────────────────┬─────────────────────┘
       │                    │                     │
       ▼                    ▼                     ▼
┌──────────────┐   ┌────────────────┐   ┌─────────────────────────────┐
│  PostgreSQL  │   │  Redis         │   │  Cloudflare R2              │
│  (Prisma)    │   │  Cache + BullMQ│   │  Fotos / Assets             │
└──────────────┘   └────────────────┘   └─────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Workers    │
                    │  (BullMQ)   │
                    │  Jobs Queue │
                    └─────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
    [Push via FCM/APNs]        [Webhooks Externos]
    (Expo Notifications)       (Futuro - Fase 3)
```

### Principios de diseño
- **Offline-first en mobile**: la app funciona sin conexión; la sincronización es eventual.
- **Event-driven internamente**: toda acción relevante emite un domain event persistido.
- **No polling**: WebSockets para foreground, Push Notifications para background.
- **Auditoría total**: toda operación queda registrada con quién, cuándo y desde dónde.
- **Soft delete**: entidades críticas nunca se borran físicamente.
- **Single tenant**: no hay multitenancy; las restricciones son por edificio asignado.

---

## 2. Diagrama Lógico de Módulos

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            BACKEND (NestJS)                               │
│                                                                            │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────────────────┐  │
│  │  AuthModule│  │  UsersModule │  │       BuildingsModule             │  │
│  │ ─────────  │  │ ──────────── │  │ ────────────────────────────────  │  │
│  │  JWT       │  │  CRUD users  │  │  buildings / floors / zones /     │  │
│  │  Login DNI │  │  roles       │  │  subzones / QR codes              │  │
│  │  Refresh   │  │  user↔bldg   │  └──────────────────────────────────┘  │
│  └────────────┘  └──────────────┘                                         │
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
│  │  AttendanceModule│  │  ReservationsModule│  │  WorkOrdersModule   │    │
│  │ ──────────────── │  │ ──────────────────│  │ ──────────────────── │    │
│  │  check-in/out    │  │  CRUD reservas    │  │  CRUD ordenes       │    │
│  │  GPS validation  │  │  estados          │  │  asignaciones       │    │
│  │  correction      │  │  → genera WO      │  │  accept/reject      │    │
│  │  timeline        │  └──────────────────┘  │  start/complete     │    │
│  └──────────────────┘                         └──────────────────────┘    │
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
│  │  TasksModule     │  │  ServiceExecution│  │  SyncModule          │    │
│  │ ──────────────── │  │  Module          │  │ ──────────────────── │    │
│  │  config tareas   │  │ ──────────────── │  │  batch sync endpoint │    │
│  │  frecuencias     │  │  start service   │  │  idempotencia        │    │
│  │  custom fields   │  │  mark tasks      │  │  conflict detection  │    │
│  │  periodic inst.  │  │  photos          │  │  prefetch endpoint   │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘    │
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
│  │  Notifications   │  │  IntegrationModule│  │  ReportsModule       │    │
│  │  Module          │  │ ──────────────── │  │ ──────────────────── │    │
│  │ ──────────────── │  │  inbound webhook  │  │  por fecha           │    │
│  │  push via Expo   │  │  log raw+parsed   │  │  por trabajador      │    │
│  │  WS emit         │  │  adapter pattern  │  │  por edificio        │    │
│  │  event routing   │  └──────────────────┘  └──────────────────────┘    │
│  └──────────────────┘                                                      │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Infrastructure Layer                                                 │ │
│  │  EventBus · AuditService · StorageService(R2) · BullMQ Queues        │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Modelo de Datos — Tablas Principales

### Usuarios y Acceso

> **Roles por edificio**: Un usuario puede tener roles distintos según el edificio (ej: administrador global, encargado solo en el edificio B). La tabla `user_building_roles` es la fuente de verdad. `building_id NULL` = rol global; `building_id` SET = rol solo en ese edificio. Para MVP, las queries de autorización usarán el campo `primary_role` (rol de mayor jerarquía del usuario, denormalizado).

```sql
users
├── id              UUID PK
├── dni             VARCHAR(20) UNIQUE NOT NULL
├── full_name       VARCHAR(200)
├── birth_date      DATE
├── password_hash   VARCHAR(255)
├── primary_role    VARCHAR(50)          -- denormalized: rol principal para queries rápidas
│                                        -- valores: admin | manager | cleaner | client | provider
├── is_active       BOOLEAN DEFAULT true
├── deleted_at      TIMESTAMPTZ          -- soft delete
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ

roles                                    -- catálogo de roles del sistema
├── id              UUID PK
├── name            VARCHAR(50) UNIQUE   -- admin | manager | cleaner | client | provider
├── description     VARCHAR(200)
└── created_at      TIMESTAMPTZ

user_building_roles                      -- roles del usuario, con scope por edificio o global
├── id              UUID PK
├── user_id         UUID FK → users
├── building_id     UUID FK → buildings  -- null = rol global (aplica a todos los edificios)
├── role_id         UUID FK → roles
├── granted_by      UUID FK → users      -- quién asignó el rol
└── created_at      TIMESTAMPTZ
-- Semántica: building_id NULL → rol global. building_id no nulo → rol solo en ese edificio.

user_devices                             -- dispositivos registrados por usuario
├── id              UUID PK
├── user_id         UUID FK → users
├── device_id       VARCHAR(200) UNIQUE  -- fingerprint del dispositivo
├── platform        ENUM(IOS, ANDROID)
├── push_token      VARCHAR(500)         -- token Expo/FCM/APNs; se actualiza en cada app start
├── app_version     VARCHAR(50)
├── last_seen_at    TIMESTAMPTZ
├── is_active       BOOLEAN DEFAULT true -- false si el usuario desactivó/cambió de dispositivo
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ
```

### Estructura Jerárquica de Edificios

```sql
buildings
├── id              UUID PK
├── name            VARCHAR(200)
├── address         VARCHAR(300)
├── city            VARCHAR(100)
├── province        VARCHAR(100)
├── latitude        DECIMAL(10,7)
├── longitude       DECIMAL(10,7)
├── gps_radius_m    INT DEFAULT 200       -- radio válido para fichar
├── is_active       BOOLEAN DEFAULT true
├── deleted_at      TIMESTAMPTZ
└── created_at, updated_at  TIMESTAMPTZ

floors  (plantas)
├── id              UUID PK
├── building_id     UUID FK → buildings
├── name            VARCHAR(100)
├── sort_order      INT
├── deleted_at      TIMESTAMPTZ
└── created_at, updated_at

zones   (zonas)
├── id              UUID PK
├── floor_id        UUID FK → floors
├── building_id     UUID FK → buildings  -- desnormalizado para queries
├── name            VARCHAR(200)
├── qr_token        VARCHAR(100) UNIQUE  -- token del QR
├── qr_expires_at   TIMESTAMPTZ          -- null = no vence
├── deleted_at      TIMESTAMPTZ
└── created_at, updated_at

subzones
├── id              UUID PK
├── zone_id         UUID FK → zones
├── building_id     UUID FK → buildings  -- desnormalizado
├── name            VARCHAR(200)
├── qr_token        VARCHAR(100) UNIQUE
├── qr_expires_at   TIMESTAMPTZ
├── deleted_at      TIMESTAMPTZ
└── created_at, updated_at
```

### Configuración de Tareas

```sql
tasks
├── id              UUID PK
├── building_id     UUID FK → buildings
├── zone_id         UUID FK → zones       -- nullable si es subzona
├── subzone_id      UUID FK → subzones    -- nullable si es zona
├── name            VARCHAR(300)
├── frequency       ENUM(
│                     EVENTUAL,    -- solo aparece en WOs/órdenes, NUNCA en módulo periódico
│                     DAILY,
│                     MON_FRI,
│                     WEEKLY,
│                     BIWEEKLY,
│                     MONTHLY,
│                     QUARTERLY,
│                     BIANNUAL,
│                     ANNUAL
│                   )
│                   -- Nota: no existe frecuencia CHECKIN_CHECKOUT. Las tareas de limpieza
│                   -- post-checkout tienen frecuencia EVENTUAL y se adjuntan a la WO
│                   -- generada por la reserva.
├── start_date      DATE
├── requires_photo          BOOLEAN DEFAULT false
├── allows_observation      BOOLEAN DEFAULT false
├── requires_rejection_reason BOOLEAN DEFAULT false
├── is_active       BOOLEAN DEFAULT true
├── deleted_at      TIMESTAMPTZ
└── created_at, updated_at

-- Campos personalizados configurables por tarea
task_custom_fields
├── id              UUID PK
├── task_id         UUID FK → tasks
├── label           VARCHAR(200)
├── field_type      ENUM(DROPDOWN)        -- extensible a futuro
├── is_required     BOOLEAN DEFAULT false
├── show_in_report  BOOLEAN DEFAULT false
├── sort_order      INT
└── created_at, updated_at

task_custom_field_options
├── id              UUID PK
├── field_id        UUID FK → task_custom_fields
├── label           VARCHAR(200)
├── sort_order      INT
└── created_at
```

### Fichaje de Presencia

```sql
attendances
├── id                  UUID PK
├── user_id             UUID FK → users
├── building_id         UUID FK → buildings
├── check_in_at         TIMESTAMPTZ NOT NULL   -- hora real del servidor
├── check_in_occurred_at TIMESTAMPTZ           -- hora del dispositivo
├── check_in_gps_lat    DECIMAL(10,7)
├── check_in_gps_lng    DECIMAL(10,7)
├── check_in_device_id  VARCHAR(200)
├── check_in_ip         INET
├── check_out_at        TIMESTAMPTZ            -- null si abierto
├── check_out_occurred_at TIMESTAMPTZ
├── check_out_gps_lat   DECIMAL(10,7)
├── check_out_gps_lng   DECIMAL(10,7)
├── check_out_device_id VARCHAR(200)
├── check_out_ip        INET
├── forgot_checkout     BOOLEAN DEFAULT false
├── is_offline_synced   BOOLEAN DEFAULT false
├── client_operation_id VARCHAR(100) UNIQUE    -- para idempotencia offline
├── corrected_by        UUID FK → users        -- null si no fue corregido
├── correction_note     TEXT
├── version             INT DEFAULT 1          -- para detección de conflictos offline
├── deleted_at          TIMESTAMPTZ
└── created_at, updated_at
```

### Reservas y Órdenes de Trabajo

> **Flujo reserva → orden de trabajo**: Una `reservation` es el dato operativo de ocupación (huésped, zona, fechas). **No es el servicio en sí**. Al registrar una reserva, el backend crea automáticamente una `work_order` de tipo `CHECKOUT_CLEANING` programada para el día del checkout. Esa WO incluye un snapshot de todas las `tasks` con `frequency = EVENTUAL` de la zona/subzona (`work_order_tasks`). La WO se crea sin trabajador asignado; la asignación es un paso posterior e independiente.

```sql
reservations
├── id                  UUID PK
├── building_id         UUID FK → buildings
├── floor_id            UUID FK → floors
├── zone_id             UUID FK → zones
├── subzone_id          UUID FK → subzones    -- nullable
├── external_id         VARCHAR(200)           -- ID del sistema externo
├── guest_name          VARCHAR(200)
├── checkin_at          TIMESTAMPTZ
├── checkout_at         TIMESTAMPTZ
├── status              ENUM(UPCOMING, CHECKIN_DAY, ACTIVE, CHECKOUT_DAY, COMPLETED)
├── source              ENUM(API, MANUAL)
├── raw_source          TEXT                   -- info origen crudo si viene de API
└── created_at, updated_at

work_orders
├── id                  UUID PK
├── type                ENUM(CHECKOUT_CLEANING, ADDITIONAL_REQUEST)
│                       -- CHECKOUT_CLEANING: generada automáticamente desde una reserva.
│                       -- ADDITIONAL_REQUEST: petición manual. Un limpiador habilitado
│                       --   en el edificio puede auto-asignársela desde mobile.
├── reservation_id      UUID FK → reservations  -- null para ADDITIONAL_REQUEST
├── building_id         UUID FK → buildings
├── floor_id            UUID FK → floors
├── zone_id             UUID FK → zones
├── subzone_id          UUID FK → subzones      -- nullable
├── title               VARCHAR(300)
├── description         TEXT
├── scheduled_date      DATE
├── scheduled_time      TIME                    -- hora estimada
├── deadline_at         TIMESTAMPTZ             -- hora límite
├── status              ENUM(
│                         UNASSIGNED,
│                         ASSIGNED,
│                         ACCEPTED,
│                         IN_PROGRESS,
│                         COMPLETED,
│                         REJECTED
│                       )
├── created_by          UUID FK → users
├── started_at          TIMESTAMPTZ
├── completed_at        TIMESTAMPTZ
├── version             INT DEFAULT 1          -- para detección de conflictos offline
├── deleted_at          TIMESTAMPTZ
└── created_at, updated_at

work_order_assignments
├── id                  UUID PK
├── work_order_id       UUID FK → work_orders
├── user_id             UUID FK → users
├── status              ENUM(PENDING, ACCEPTED, REJECTED)
├── rejection_reason_id UUID FK → rejection_reasons  -- nullable
├── rejection_note      TEXT
├── responded_at        TIMESTAMPTZ
└── created_at, updated_at

rejection_reasons   (ABM configurable)
├── id              UUID PK
├── type            ENUM(SERVICE_REJECTION, TASK_NOT_DONE)
│               -- SERVICE_REJECTION: motivo por rechazo de asignación de un servicio
│               -- TASK_NOT_DONE: motivo por el que una tarea no fue realizada
├── text            VARCHAR(300)
├── is_active       BOOLEAN DEFAULT true
├── deleted_at      TIMESTAMPTZ
└── created_at, updated_at
```

### Snapshot de Tareas por Orden de Trabajo

> Al crear una `work_order`, el sistema congela una copia de las tareas aplicables (todas las `tasks` con `frequency = EVENTUAL` en la zona/subzona). Esto garantiza que cambios posteriores en la configuración maestra de tareas no alteren órdenes ya creadas ni sus ejecuciones históricas. Lo mismo aplica para los campos personalizados.

```sql
work_order_tasks
├── id                               UUID PK
├── work_order_id                    UUID FK → work_orders
├── task_id                          UUID FK → tasks      -- referencia original (solo trazabilidad)
├── name_snapshot                    VARCHAR(300)         -- nombre al momento de crear la WO
├── requires_photo_snapshot          BOOLEAN
├── allows_observation_snapshot      BOOLEAN
├── requires_rejection_reason_snapshot BOOLEAN
├── sort_order                       INT
└── created_at                       TIMESTAMPTZ

-- Snapshot de campos personalizados de cada tarea dentro de la WO
work_order_task_custom_fields
├── id                   UUID PK
├── work_order_task_id   UUID FK → work_order_tasks
├── original_field_id    UUID FK → task_custom_fields   -- referencia original (trazabilidad)
├── label_snapshot       VARCHAR(200)
├── field_type           VARCHAR(50)                  -- DROPDOWN (extensible)
├── is_required          BOOLEAN
├── show_in_report       BOOLEAN
├── sort_order           INT
└── created_at           TIMESTAMPTZ

-- Snapshot de opciones de cada campo personalizado dentro de la WO
work_order_task_custom_field_options
├── id                        UUID PK
├── work_order_task_field_id  UUID FK → work_order_task_custom_fields
├── original_option_id        UUID FK → task_custom_field_options   -- referencia original
├── label_snapshot            VARCHAR(200)
├── sort_order                INT
└── created_at                TIMESTAMPTZ
```

### Ejecución de Servicios

```sql
service_executions
├── id                  UUID PK
├── work_order_id       UUID FK → work_orders
├── attendance_id       UUID FK → attendances    -- quien fichó para ejecutar
├── started_by          UUID FK → users
├── started_at          TIMESTAMPTZ              -- hora servidor
├── occurred_at         TIMESTAMPTZ              -- hora dispositivo (offline)
├── completed_at        TIMESTAMPTZ
├── status              ENUM(IN_PROGRESS, COMPLETED, CANCELLED)
├── client_operation_id VARCHAR(100) UNIQUE
├── is_offline_synced   BOOLEAN DEFAULT false
├── version             INT DEFAULT 1          -- para detección de conflictos offline
└── created_at, updated_at

task_executions   (cada tarea marcada en una ejecución)
├── id                        UUID PK
├── service_execution_id      UUID FK → service_executions        -- null para tareas periódicas
├── work_order_task_id        UUID FK → work_order_tasks          -- null para tareas periódicas
│                           -- apunta al snapshot de la WO, NO a la tarea maestra
├── periodic_task_instance_id UUID FK → periodic_task_instances   -- null para tareas de WO
│   -- Regla: exactamente uno de (work_order_task_id, periodic_task_instance_id) debe ser
│   --   no nulo. Nunca ambos, nunca ninguno.
│   -- CHECK: (work_order_task_id IS NOT NULL) != (periodic_task_instance_id IS NOT NULL)
│   -- service_execution_id es no nulo si y solo si work_order_task_id es no nulo.
├── status               ENUM(DONE, NOT_DONE, SKIPPED)
├── rejection_reason_id  UUID FK → rejection_reasons   -- tipo TASK_NOT_DONE; si NOT_DONE
├── observation          TEXT
├── executed_by          UUID FK → users
├── executed_at          TIMESTAMPTZ
├── occurred_at          TIMESTAMPTZ                   -- hora del dispositivo (offline)
├── client_operation_id  VARCHAR(100) UNIQUE
├── is_offline_synced    BOOLEAN DEFAULT false
└── version              INT DEFAULT 1                 -- para detección de conflictos offline

task_execution_field_values
├── id                      UUID PK
├── task_execution_id       UUID FK → task_executions
├── snapshot_field_id       UUID FK → work_order_task_custom_fields  -- apunta al snapshot
├── selected_option_ids     UUID[]    -- IDs de work_order_task_custom_field_options
└── created_at              TIMESTAMPTZ

task_photos
├── id                  UUID PK
├── task_execution_id   UUID FK → task_executions
├── storage_key         VARCHAR(500)             -- clave en R2
├── storage_url         VARCHAR(1000)            -- URL firmada (generada on-demand)
├── file_size_bytes     INT
├── width_px            INT
├── height_px           INT
├── captured_at         TIMESTAMPTZ              -- EXIF o timestamp dispositivo
├── uploaded_at         TIMESTAMPTZ
├── gps_lat             DECIMAL(10,7)
├── gps_lng             DECIMAL(10,7)
├── uploaded_by         UUID FK → users
├── deleted_at          TIMESTAMPTZ
├── deleted_by          UUID FK → users
└── created_at
```

### Tareas Periódicas — Control de Instancias

```sql
-- NO se generan masivamente por adelantado.
-- Una instancia se materializa solo cuando se "activa" el período.
-- El cálculo de si una tarea corresponde al día actual se hace en query.
periodic_task_instances
├── id                  UUID PK
├── task_id             UUID FK → tasks
├── period_label        VARCHAR(50)    -- ej: "2026-06", "2026-W23"
├── period_start        DATE
├── period_end          DATE           -- fin del período (último día inclusive)
├── status              ENUM(PENDING, COMPLETED, EXPIRED)
├── completed_at        TIMESTAMPTZ
└── created_at, updated_at
-- La ejecución de la instancia se accede mediante task_executions.periodic_task_instance_id
```

### Sincronización Offline

```sql
-- Esta tabla vive en SQLite LOCAL del dispositivo, no en PostgreSQL
sync_queue  (SQLite local)
├── client_operation_id  TEXT PRIMARY KEY   -- UUID generado en dispositivo
├── device_id            TEXT
├── user_id              TEXT
├── entity_type          TEXT    -- attendance | service_execution | task_execution | photo
├── entity_id            TEXT
├── operation_type       TEXT    -- checkin | checkout | start_service | complete_task | etc.
├── payload              TEXT    -- JSON serializado
├── occurred_at          TEXT    -- ISO 8601, hora del dispositivo
├── sent_at              TEXT    -- null si aún no se envió
├── base_version         INT     -- versión de la entidad cuando se generó la op
└── status               TEXT    -- PENDING | SYNCED | CONFLICT | ERROR

-- Esta tabla vive en PostgreSQL (servidor)
sync_conflicts
├── id                  UUID PK
├── client_operation_id VARCHAR(100)
├── device_id           VARCHAR(200)
├── user_id             UUID FK → users
├── entity_type         VARCHAR(50)
├── entity_id           UUID
├── operation_type      VARCHAR(50)
├── payload             JSONB
├── occurred_at         TIMESTAMPTZ
├── received_at         TIMESTAMPTZ
├── conflict_reason     TEXT
├── resolved_by         UUID FK → users    -- null si sin resolver
├── resolved_at         TIMESTAMPTZ
└── created_at
```

### Integración Externa y Auditoría

```sql
integration_inbound_logs
├── id                      UUID PK
├── source                  VARCHAR(100)   -- nombre del sistema origen
├── headers                 JSONB
├── raw_body                TEXT           -- body crudo SIEMPRE guardado
├── received_at             TIMESTAMPTZ
├── status                  ENUM(RECEIVED, PARSED, ERROR)
├── parsed_payload          JSONB          -- null si no pudo parsearse
├── error_message           TEXT
├── related_reservation_id  UUID FK → reservations   -- null si no generó
├── related_work_order_id   UUID FK → work_orders     -- null si no generó
└── created_at

domain_events   (event store)
├── id              UUID PK
├── event_type      VARCHAR(100)    -- work_order.assigned, attendance.checked_in, etc.
├── entity_type     VARCHAR(50)
├── entity_id       UUID
├── payload         JSONB
├── triggered_by    UUID FK → users  -- null si sistema
├── occurred_at     TIMESTAMPTZ
├── processed_at    TIMESTAMPTZ      -- null si pendiente de procesar
└── created_at

audit_log
├── id              UUID PK
├── user_id         UUID FK → users
├── action          VARCHAR(100)     -- CREATE | UPDATE | DELETE | CORRECT
├── entity_type     VARCHAR(50)
├── entity_id       UUID
├── old_value       JSONB
├── new_value       JSONB
├── ip              INET
├── device_id       VARCHAR(200)
└── created_at      TIMESTAMPTZ
```

---

## 4. Relaciones Entre Entidades

```
buildings ──< floors ──< zones ──< subzones
                              │         │
                              └────┬────┘
                                   │
                                tasks ──< task_custom_fields ──< task_custom_field_options
                                   │
                          periodic_task_instances

users >──< roles      (via user_building_roles — scope por edificio o global)
users ──< user_devices
users ──< attendances
users ──< work_order_assignments

reservations ──< work_orders ──< work_order_assignments ──< users
                      │
                      ├──< work_order_tasks [snapshot de tasks EVENTUAL al crear la WO]
                      │         └──< work_order_task_custom_fields
                      │                   └──< work_order_task_custom_field_options
                      │
                      └──< service_executions ──< task_executions ──< task_photos
                          (o periodic_task_instances para tareas periódicas)
                                                         │
                                              task_execution_field_values
                                              (→ work_order_task_custom_fields; solo WO-based)

domain_events ── (referencia lógica a cualquier entidad vía entity_type+entity_id)
audit_log     ── (idem)
sync_conflicts ── users

integration_inbound_logs ──? reservations
integration_inbound_logs ──? work_orders
```

**Reglas de integridad clave:**
- Una `zone` con subzonas NO puede tener `tasks` directamente (validado en backend, no solo en DB).
- Un `attendance` abierto (sin `check_out_at`) bloquea nuevo check-in del mismo usuario.
- Una `service_execution` solo puede iniciarse si el usuario tiene `attendance` activo en el edificio de la WO.
- Una `task_execution` con `requires_photo_snapshot=true` necesita al menos 1 `task_photo` para marcar `DONE`.
- Una `work_order` de tipo `CHECKOUT_CLEANING` debe tener exactamente 1 `reservation_id`.
- Al crear una `work_order`, el backend genera automáticamente los registros `work_order_tasks` copiando las `tasks` con `frequency = EVENTUAL` de la zona/subzona correspondiente.
- Una `task_execution` debe tener exactamente uno de `work_order_task_id` (WO-based) o `periodic_task_instance_id` (periódica). Nunca ambos, nunca ninguno (CHECK constraint en DB, validado también en backend).
- Los `task_executions` para WOs apuntan a `work_order_task_id`, nunca directamente a `task_id`, para preservar el snapshot histórico.
- Un `rejection_reason` de tipo `SERVICE_REJECTION` solo aplica a `work_order_assignments`. Un `rejection_reason` de tipo `TASK_NOT_DONE` solo aplica a `task_executions`.
- Un `user` con rol `manager` puede iniciar cualquier `work_order` de sus edificios habilitados, aunque no esté en `work_order_assignments`. Un `cleaner` solo puede iniciar WOs donde tiene un assignment `ACCEPTED`.

---

## 5. Estados de Entidades Principales

### WorkOrder

```
                    ┌──────────────┐
                    │  UNASSIGNED  │ ← creada (manual o por reserva)
                    └──────┬───────┘
                           │ admin asigna usuario/s
                    ┌──────▼───────┐
                    │   ASSIGNED   │
                    └──────┬───────┘
                           │ al menos 1 asignado acepta
                    ┌──────▼───────┐
                    │   ACCEPTED   │
                    └──────┬───────┘
                           │ usuario inicia servicio
                    ┌──────▼───────┐
                    │  IN_PROGRESS │
                    └──────┬───────┘
                           │ finalizar servicio
                    ┌──────▼───────┐
                    │  COMPLETED   │
                    └──────────────┘

           ASSIGNED → REJECTED  (si TODOS los asignados rechazan)
           ACCEPTED → REJECTED  (raro, solo si admin fuerza)
```

### WorkOrderAssignment

```
PENDING ──→ ACCEPTED
        ↘──→ REJECTED (con rejection_reason_id)
```
> Si queda al menos 1 ACCEPTED, la WO puede continuar aunque otros rechacen.

### Attendance

```
         ┌────────────┐
         │   ACTIVE   │  (check_in_at presente, check_out_at NULL)
         └─────┬──────┘
               │ usuario ficha salida
               ▼
         ┌────────────┐
         │   CLOSED   │  (check_out_at presente)
         └────────────┘

ACTIVE → FORGOTTEN  (job nocturno marca forgot_checkout=true si sigue abierto
                     al finalizar el día o tras umbral configurable)
```

### ServiceExecution

```
IN_PROGRESS ──→ COMPLETED
            ↘──→ CANCELLED  (solo admin puede forzar)
```

### PeriodicTaskInstance

```
PENDING ──→ COMPLETED  (tarea marcada DONE dentro del período)
        ↘──→ EXPIRED   (job nocturno al día siguiente del period_end)
```
> Las instancias EXPIRED no se reprograman. La próxima frecuencia genera una nueva instancia.

### Reservation

```
UPCOMING → CHECKIN_DAY → ACTIVE → CHECKOUT_DAY → COMPLETED
```
> Transiciones automáticas por job diario (BullMQ cron).

---

## 6. Diseño de Sincronización Offline

### Decisión de almacenamiento local: expo-sqlite + SyncManager propio

Para el **MVP** se utiliza `expo-sqlite` con un `SyncManager` custom en lugar de WatermelonDB. Esta decisión reduce la complejidad inicial:

| Criterio | expo-sqlite + SyncManager propio | WatermelonDB |
|---|---|---|
| Complejidad inicial | Baja | Alta (schema reactivo, observers, migrations propias) |
| Control del schema | Total | Acotado al modelo de WatermelonDB |
| Performance (100 usuarios) | Suficiente | Mejor para datasets grandes |
| Curva de aprendizaje | Mínima | Moderada |
| Migración futura | Posible si escala | No necesaria |

> **Decisión**: MVP con `expo-sqlite` + SyncManager propio. Si en Fase 2 aparecen problemas de performance o complejidad justificados (>1.000 registros locales, sync lento en gama baja), se evalúa migración a WatermelonDB.

### Arquitectura en el dispositivo

```
┌──────────────────────────────────────────────┐
│              App (React Native)               │
│                                               │
│  ┌──────────────────────────────────────────┐│
│  │      expo-sqlite (SQLite local)            ││
│  │                                           ││
│  │  Tablas locales:                          ││
│  │  · local_work_orders (prefetch del día)   ││
│  │  · local_work_order_tasks (snapshot WO)    ││
│  │  · local_assignments                      ││
│  │  · local_attendance_state                 ││
│  │  · local_buildings (básico)               ││
│  │  · sync_queue (operaciones pendientes)    ││
│  └──────────────────────────────────────────┘│
│                                               │
│  ┌──────────────────────────────────────────┐│
│  │    SyncManager (servicio custom JS)       ││
│  │                                           ││
│  │  · Detecta reconexión (NetInfo)           ││
│  │  · Lee sync_queue por occurred_at ASC     ││
│  │  · POST /sync/batch al servidor           ││
│  │  · Actualiza estado de cada operación     ││
│  │  · Reintentos exponenciales (máx 5)       ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

### Flujo de operación offline

```
Usuario realiza acción (ej: fichar entrada)
         │
         ▼
  ¿Hay conexión?
  ┌──── SÍ ────┐                    ┌──── NO ────┐
  │            │                    │            │
  ▼            │                    ▼            │
POST al API    │           Guardar en sync_queue │
con resultado  │           con status=PENDING    │
inmediato      │           Actualizar SQLite local│
               └────────────────────────────────┘

               Cuando se recupera conexión:
               SyncManager envía batch al API
```

### Formato de operación en la cola

```json
{
  "clientOperationId": "uuid-v4",
  "deviceId": "device-fingerprint",
  "userId": "uuid",
  "entityType": "attendance",
  "entityId": "uuid-local-generado",
  "operationType": "checkin",
  "payload": { "buildingId": "...", "gpsLat": 40.4, "gpsLng": -3.7 },
  "occurredAt": "2026-06-02T09:15:00.000Z",
  "sentAt": null,
  "baseVersion": 0,
  "status": "PENDING"
}
```

### Prefetch al fichar (para garantizar offline posterior)

Al fichar en un edificio con conexión, la app descarga:
- `work_orders` del día + próximos 2 días del edificio.
- `tasks` de todas las zonas/subzonas del edificio (con custom fields).
- Estado actual de `assignments` propios.

Esto permite operar offline durante toda la jornada laboral.

### Idempotencia del lado servidor

Cada operación lleva `clientOperationId` (UUID generado en el dispositivo). El servidor:
1. Verifica si ya existe esa operación procesada → retorna 200 con resultado previo (no reejecutar).
2. Si no existe → procesa y guarda el `clientOperationId` en la entidad resultante.
3. La respuesta siempre incluye el estado actual de la entidad.

---

## 7. Estrategia de Resolución de Conflictos

### Modelo de detección

Cada entidad sincronizable (`attendance`, `work_order`, `service_execution`, `task_execution`) expone un campo `version` (INT, incremental). El cliente envía `base_version` junto con cada operación.

```
Cliente envía: { operationType: "complete_service", entityId: "X", baseVersion: 3 }

Servidor evalúa:
  ┌─ entity.version == baseVersion → OK → aplicar cambio, version++
  └─ entity.version != baseVersion → CONFLICTO → no aplicar
```

### Tabla de decisión de conflictos

| Operación         | Entidad ya en estado         | Acción del servidor          |
|-------------------|------------------------------|------------------------------|
| complete_service  | COMPLETED (por otro usuario) | Conflicto duro → rechazar    |
| complete_task     | DONE (por mismo usuario)     | Idempotente → aceptar        |
| complete_task     | DONE (por otro usuario)      | Conflicto blando → rechazar  |
| checkin           | Usuario ya tiene ACTIVE       | Conflicto → rechazar         |
| checkout          | Attendance ya CLOSED          | Idempotente → aceptar        |

### Respuesta al dispositivo en conflicto

```json
{
  "clientOperationId": "uuid",
  "status": "CONFLICT",
  "conflictReason": "SERVICE_ALREADY_COMPLETED",
  "message": "No se pudo sincronizar: el servicio ya fue realizado por María García. Comunícate con el administrador para resolver.",
  "conflictingUserId": "uuid",
  "conflictingUserName": "María García",
  "serverEntityState": { /* estado actual en servidor */ }
}
```

**Regla clave: los datos locales NUNCA se borran ante un conflicto.** El registro queda en `sync_queue` con `status=CONFLICT` y se persiste en `sync_conflicts` en el servidor.

El admin puede ver todos los conflictos pendientes en el panel web y resolverlos manualmente, generando el correspondiente `audit_log`.

---

## 8. Estrategia de Realtime y Notificaciones

### Arquitectura event-driven

```
Acción del usuario
       │
       ▼
  NestJS Service
       │
       ├── 1. Persistir en DB
       │
       ├── 2. Emitir DomainEvent
       │         └──→ EventBus (interno NestJS)
       │                   └──→ Persistir en domain_events
       │                   └──→ Encolar en BullMQ (queue: "events")
       │
       └── 3. Retornar respuesta HTTP al cliente

BullMQ Worker (eventos):
       │
       ├── Para usuarios conectados (web/mobile foreground):
       │    └──→ Socket.IO emit a rooms relevantes
       │
       ├── Para móviles en background:
       │    └──→ Expo Push API → FCM (Android) / APNs (iOS)
       │
       └── Para integraciones externas (Fase 3):
            └──→ Webhook POST al endpoint configurado
```

### Socket.IO — Salas por contexto

| Sala                  | Quiénes se suscriben             | Qué reciben                               |
|-----------------------|----------------------------------|-------------------------------------------|
| `building:{id}`       | Admin, managers, cleaners        | Todos los eventos del edificio            |
| `user:{id}`           | Todos                            | Notificaciones personales                 |
| `admin`               | Solo admins                      | Eventos globales, alertas del sistema     |
| `workorder:{id}`      | Asignados + admin                | Cambios de estado de esa orden            |

### Push Notifications — Criterios de envío

| Evento                        | Push a                          | Condición                          |
|-------------------------------|---------------------------------|------------------------------------|
| Nueva asignación              | Usuario asignado                | Siempre (aunque no esté fichado)   |
| Aceptación de compañero       | Demás asignados + admin         | Solo si WO requiere múltiples      |
| Rechazo de asignación         | Admin + managers                | Siempre                            |
| Servicio iniciado             | Admin del edificio              | En horario laboral                 |
| Servicio completado           | Admin + cliente del edificio    | Siempre                            |
| Fichaje olvidado              | Usuario afectado + admin        | Job nocturno                       |
| Conflicto de sync             | Usuario afectado                | Siempre                            |
| Nueva petición adicional      | Limpiadores del edificio        | Cuando WO sin asignar              |

### Sin polling

- Web admin: conecta WebSocket al cargar, se suscribe a salas según rol.
- Mobile app: conecta WebSocket cuando en primer plano; en background usa push.
- No hay `setInterval` de fetch. Todos los cambios de estado llegan por push.

---

## 9. Endpoints REST Principales

### Auth
```
POST   /auth/login                    { dni, password } → { accessToken, refreshToken, user }
POST   /auth/refresh                  { refreshToken } → { accessToken }
POST   /auth/logout                   Invalida refresh token
PUT    /auth/change-password          Solo admin y self (admins)
```

### Users
```
GET    /users                         ?role=&buildingId=&search= (paginado)
POST   /users
GET    /users/:id
PUT    /users/:id
DELETE /users/:id                     Soft delete
GET    /users/:id/building-roles                   Lista de roles por edificio del usuario
POST   /users/:id/building-roles                   { buildingId?, roleId } — null buildingId = rol global
DELETE /users/:id/building-roles/:id
POST   /users/me/devices                           { deviceId, platform, pushToken, appVersion }
PUT    /users/me/devices/:deviceId                 { pushToken?, appVersion? }
DELETE /users/me/devices/:deviceId
```

### Buildings
```
GET    /buildings                     ?search= (paginado)
POST   /buildings
GET    /buildings/:id
PUT    /buildings/:id
DELETE /buildings/:id

GET    /buildings/:id/floors
POST   /buildings/:id/floors
PUT    /floors/:id
DELETE /floors/:id

GET    /floors/:id/zones
POST   /floors/:id/zones
PUT    /zones/:id
DELETE /zones/:id
GET    /zones/:id/qr                  → { qrToken, url, expiresAt }
POST   /zones/:id/qr/regenerate

GET    /zones/:id/subzones
POST   /zones/:id/subzones
PUT    /subzones/:id
DELETE /subzones/:id
GET    /subzones/:id/qr

POST   /buildings/import              multipart/form-data Excel
GET    /buildings/import/template     Descarga plantilla vacía
```

### Tasks
```
GET    /tasks                         ?buildingId=&zoneId=&subzoneId=&frequency=
POST   /tasks
GET    /tasks/:id
PUT    /tasks/:id
DELETE /tasks/:id

POST   /tasks/:id/custom-fields
PUT    /custom-fields/:id
DELETE /custom-fields/:id
POST   /custom-fields/:id/options
PUT    /custom-field-options/:id
DELETE /custom-field-options/:id

GET    /tasks/due-today               ?buildingId= (para el día actual, resuelve frecuencias)
POST   /tasks/import                  Excel masivo
```

### Attendance
```
POST   /attendance/checkin            { buildingId, gpsLat, gpsLng, occurredAt, clientOperationId }
POST   /attendance/checkout           { attendanceId, gpsLat, gpsLng, occurredAt, clientOperationId }
GET    /attendance                    ?userId=&buildingId=&date=&page= (admin)
GET    /attendance/active             Ficajes activos ahora mismo (admin)
GET    /attendance/timeline           ?date= vista timeline del día
PUT    /attendance/:id/correct        { checkInAt?, checkOutAt?, note } Admin solo
GET    /attendance/me                 Fichaje activo del usuario autenticado
```

### Reservations
```
GET    /reservations                  ?buildingId=&status=&from=&to=&page=
POST   /reservations
GET    /reservations/:id
PUT    /reservations/:id
GET    /reservations/:id/work-orders
```

### WorkOrders
```
GET    /work-orders                   ?buildingId=&status=&type=&date=&assignedTo=&page=
POST   /work-orders
GET    /work-orders/:id
PUT    /work-orders/:id
DELETE /work-orders/:id               Soft delete

POST   /work-orders/:id/assign        { userIds: [] }
POST   /work-orders/:id/accept        { clientOperationId }
POST   /work-orders/:id/reject        { rejectionReasonId, note, clientOperationId }
POST   /work-orders/:id/start         { attendanceId, clientOperationId, occurredAt }
POST   /work-orders/:id/complete      { clientOperationId, occurredAt }

GET    /work-orders/recommended-workers  ?workOrderId= (para asignación con recomendación)
```

### ServiceExecution
```
GET    /service-executions/:id
GET    /service-executions/:id/tasks         Lista de tareas con su estado actual
PUT    /service-executions/:id/tasks/:taskId { status, observación, rejectionReasonId, clientOperationId }
POST   /service-executions/:id/tasks/:taskId/photos  multipart
DELETE /task-photos/:id                      Solo admin
```

### Sync (Offline)
```
POST   /sync/batch                    [ ...operations ] → [ ...results con status ]
GET    /sync/prefetch                 ?buildingId=&date= → Payload completo para offline
```

### Integrations (Webhooks Inbound)
```
POST   /integrations/inbound/:source  Body libre → loguea crudo, intenta parsear
GET    /integrations/inbound-logs     ?source=&status=&from=&to=&page= (admin)
GET    /integrations/inbound-logs/:id
```

### Rejection Reasons (ABM)
```
GET    /rejection-reasons             ?type=SERVICE_REJECTION|TASK_NOT_DONE
POST   /rejection-reasons
PUT    /rejection-reasons/:id
DELETE /rejection-reasons/:id         Soft delete
```

### Notifications
```
GET    /notifications/me              Historial personal
PUT    /notifications/:id/read
PUT    /notifications/read-all
```

### Dashboard
```
GET    /dashboard/summary             Indicadores principales en tiempo real
```

---

## 10. Eventos Internos Principales

Todos los eventos se persisten en `domain_events` y son procesados por BullMQ.

### Attendance
| Evento | Trigger |
|--------|---------|
| `attendance.checked_in` | Usuario ficha entrada |
| `attendance.checked_out` | Usuario ficha salida |
| `attendance.forgot_checkout` | Job nocturno detecta abierto |
| `attendance.corrected` | Admin corrige fichaje |

### WorkOrder
| Evento | Trigger |
|--------|---------|
| `work_order.created` | Creación manual o por reserva |
| `work_order.assigned` | Admin asigna trabajadores |
| `work_order.assignment.accepted` | Trabajador acepta |
| `work_order.assignment.rejected` | Trabajador rechaza |
| `work_order.started` | Inicio de ejecución |
| `work_order.completed` | Finalización exitosa |
| `work_order.status_changed` | Cualquier cambio de estado |
| `work_order.alert_unassigned` | Job: WO sin asignar próxima a su fecha |

### ServiceExecution / Tasks
| Evento | Trigger |
|--------|---------|
| `service_execution.started` | Inicio de servicio |
| `service_execution.completed` | Finalización de servicio |
| `task_execution.done` | Tarea marcada completada |
| `task_execution.not_done` | Tarea marcada no realizada |
| `periodic_task.expired` | Job: instancia mensual/semanal vencida |

### Reservations
| Evento | Trigger |
|--------|---------|
| `reservation.created` | Nueva reserva (manual o API) |
| `reservation.work_order_generated` | WO generada automáticamente |
| `reservation.status_changed` | Cambio de estado por job diario |

### Sync
| Evento | Trigger |
|--------|---------|
| `sync.conflict_detected` | Conflicto al procesar operación offline |
| `sync.batch_received` | Lote de operaciones recibido |

### Integrations
| Evento | Trigger |
|--------|---------|
| `integration.inbound_received` | Request externo recibido |
| `integration.reservation_parsed` | Reserva creada desde integración |
| `integration.parse_error` | No se pudo parsear request externo |

---

## 11. Estructura Recomendada del Monorepo

```
steam-genie/
│
├── apps/
│   ├── api/                          # NestJS Backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── buildings/
│   │   │   │   │   ├── floors/
│   │   │   │   │   ├── zones/
│   │   │   │   │   └── subzones/
│   │   │   │   ├── attendance/
│   │   │   │   ├── reservations/
│   │   │   │   ├── work-orders/
│   │   │   │   │   ├── assignments/
│   │   │   │   │   └── work-order-tasks/  # snapshot al crear WO
│   │   │   │   ├── tasks/
│   │   │   │   │   ├── custom-fields/
│   │   │   │   │   └── periodic-instances/
│   │   │   │   ├── service-executions/
│   │   │   │   ├── sync/
│   │   │   │   ├── notifications/
│   │   │   │   ├── integrations/
│   │   │   │   ├── reports/
│   │   │   │   └── dashboard/
│   │   │   ├── infrastructure/
│   │   │   │   ├── event-bus/
│   │   │   │   ├── storage/           # R2 adapter
│   │   │   │   ├── queues/            # BullMQ definitions
│   │   │   │   ├── audit/
│   │   │   │   └── websocket/         # Socket.IO gateway
│   │   │   ├── common/
│   │   │   │   ├── guards/
│   │   │   │   ├── decorators/
│   │   │   │   ├── pipes/
│   │   │   │   └── filters/
│   │   │   └── main.ts
│   │   └── Dockerfile
│   │
│   ├── web/                           # Next.js Web Admin
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── dashboard/
│   │   │   ├── buildings/
│   │   │   ├── users/
│   │   │   ├── attendance/
│   │   │   ├── reservations/
│   │   │   ├── work-orders/
│   │   │   ├── tasks/
│   │   │   ├── calendar/
│   │   │   ├── additional-requests/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── api-client.ts
│   │   │   └── socket.ts
│   │   └── Dockerfile
│   │
│   └── mobile/                        # Expo React Native
│       ├── app/                       # Expo Router
│       │   ├── (auth)/
│       │   │   └── login.tsx
│       │   ├── (tabs)/
│       │   │   ├── index.tsx          # Home / Fichaje
│       │   │   ├── tasks.tsx          # Tareas periódicas
│       │   │   ├── requests.tsx       # Peticiones adicionales
│       │   │   └── profile.tsx
│       │   └── service/
│       │       └── [id].tsx           # Ejecución de servicio
│       ├── src/
│       │   ├── components/
│       │   ├── stores/                # Zustand stores
│       │   ├── db/                    # expo-sqlite: schema, migrations, queries locales
│       │   ├── sync/                  # SyncManager, queue, conflicts
│       │   ├── hooks/
│       │   └── services/              # API calls
│       └── app.json
│
├── packages/
│   ├── shared-types/                  # DTOs y types TypeScript compartidos
│   │   ├── src/
│   │   │   ├── user.types.ts
│   │   │   ├── work-order.types.ts
│   │   │   ├── sync.types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── shared-validators/             # Schemas Zod compartidos
│   │   ├── src/
│   │   └── package.json
│   │
│   └── shared-constants/             # Enums y constantes compartidas
│       ├── src/
│       │   ├── roles.ts
│       │   ├── frequencies.ts
│       │   ├── statuses.ts
│       │   └── events.ts
│       └── package.json
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── scripts/
│   ├── generate-qr.ts
│   └── excel-import.ts
│
├── docker-compose.yml                 # Dev: PostgreSQL + Redis
├── docker-compose.prod.yml
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example
└── README.md
```

---

## 12. Plan de Implementación en Fases

### Fase 0 — Infraestructura base (Día 1–2)
- Monorepo con Turborepo + pnpm workspaces.
- Docker Compose local: PostgreSQL 16 + Redis 7.
- NestJS bootstrapeado con Prisma conectado.
- Next.js con autenticación vacía.
- Expo inicializado con Expo Router.
- CI básico (lint + typecheck).
- Railway: proyectos API, PostgreSQL, Redis configurados.
- Cloudflare R2: bucket + API token + CORS.
- Variables de entorno documentadas.

### Fase 1 — MVP funcional (Día 3–15)
Ver sección 13.

### Fase 2 — Plataforma completa (Semanas 4–8)
- QR codes y deep linking en la app.
- Campos personalizados en tareas (dropdown + opciones). El snapshot en `work_order_tasks` ya está preparado en el modelo.
- Import masivo por Excel (edificios, zonas, tareas).
- Vista calendario en web admin.
- Peticiones adicionales: creación por cliente (rol Cliente desde web/app).
- Roles Cliente y Proveedor operativos con sus vistas y flujos específicos.
- Gestión completa de instancias de tareas periódicas (vencimientos, histórico).
- API externa de reservas (integration_inbound_logs + adapter extensible).
- Corrección de fichajes por admin con auditoría completa.
- UI de conflictos de sync para admin.
- Reportería básica (por fecha, por trabajador, por edificio).
- Notificaciones avanzadas (push a clientes, alertas WO sin asignar).

### Fase 3 — Madurez y escala (Semanas 9–12)
- Publicación en Google Play y App Store.
- Reportería avanzada (gráficos, exportación PDF/Excel).
- Webhooks outbound para integraciones externas.
- Integración RRHH para sincronización de empleados.
- Permisos granulares avanzados (si escala más allá del modelo de roles actual).
- Tablets: layout adaptado.
- Backups automáticos programados con validación.
- Sentry + alertas configuradas.
- Logs estructurados (Pino + dashboard Railway).

---

## 13. MVP Funcional de 15 Días

### Qué ENTRA en el MVP

**Backend (NestJS + Prisma):**
- [ ] Auth: login por DNI, JWT (access + refresh), sesión persistente.
- [ ] CRUD Usuarios con `user_building_roles` (roles por edificio o global) + `user_devices` (push tokens y multi-dispositivo).
- [ ] CRUD Edificios + Plantas + Zonas + Subzonas.
- [ ] CRUD Tareas con frecuencias (sin custom fields complejos para MVP).
- [ ] ABM de motivos de rechazo/no realización (`rejection_reasons`).
- [ ] Fichaje: check-in/out con validación GPS + soporte offline (`clientOperationId`, `occurredAt`).
- [ ] Work Orders `CHECKOUT_CLEANING`: CRUD + asignación + accept/reject + start + complete.
- [ ] Work Orders `ADDITIONAL_REQUEST` (peticiones adicionales): CRUD + toma por limpiador (self-assign) + ejecución completa.
- [ ] Generación automática de `work_order_tasks` (snapshot) al crear WO: copia las `tasks` con `frequency = EVENTUAL` de la zona/subzona.
- [ ] `ServiceExecution`: iniciar (valida `attendance` activo en el edificio), marcar tareas por `work_order_task_id`, finalizar.
- [ ] Upload de fotos a R2 (comprés en cliente, 1–2 por tarea, sin custom fields).
- [ ] Endpoint `POST /sync/batch` con idempotencia y detección básica de conflictos.
- [ ] Endpoint `GET /sync/prefetch` para preparar datos offline al fichar.
- [ ] Reservas: creación manual + generación automática de WO `CHECKOUT_CLEANING` al registrar checkout.
- [ ] Push notifications básicas: nueva asignación + conflicto de sync.
- [ ] Dashboard: contadores básicos (servicios pendientes/en curso/completados, presencia activa).
- [ ] Domain events persistidos + BullMQ queue activo.
- [ ] Audit log en operaciones clave.
- [ ] Soft delete en entidades críticas.

**Mobile (Expo):**
- [ ] Login con DNI.
- [ ] Pantalla inicio: botón circular de fichaje (hold to check-in/out) + selección de edificio.
- [ ] Timer activo mientras fichado.
- [ ] Lista de servicios del día (asignados y aceptados, ordenados por proximidad).
- [ ] Aceptar/rechazar servicio con motivo (requiere conexión).
- [ ] Iniciar servicio (valida que el usuario esté fichado en el edificio).
- [ ] Ejecución de servicio: lista de tareas por zona/subzona, marcar DONE/NOT\_DONE + foto opcional.
- [ ] Finalizar servicio.
- [ ] Peticiones adicionales: ver disponibles en el edificio + tomar (self-assign desde mobile).
- [ ] Encargado: puede iniciar cualquier servicio del edificio aunque no esté asignado a la WO.
- [ ] Cola offline (`expo-sqlite` + SyncManager): fichaje + tareas + fotos se encolan y sincronizan al recuperar conexión.
- [ ] Indicador visual de modo offline.
- [ ] Mensaje descriptivo cuando hay conflicto de sync (no borrar datos locales).
- [ ] Notificaciones push recibidas en background.

**Web Admin (Next.js):**
- [ ] Login con DNI.
- [ ] Dashboard con indicadores en tiempo real (WebSocket).
- [ ] Gestión de edificios: crear, editar, estructura jerárquica completa.
- [ ] Gestión de usuarios: crear, asignar roles por edificio o global (`user_building_roles`).
- [ ] ABM de motivos de rechazo/no realización.
- [ ] Timeline de fichajes del día.
- [ ] Work Orders `CHECKOUT_CLEANING`: crear, asignar (con trabajadores recomendados), ver estados.
- [ ] Work Orders `ADDITIONAL_REQUEST`: crear desde web admin, ver tomadas/asignadas.
- [ ] Reservas: crear manual, lista con indicador “zona lista / no lista”, ver WO asociada.
- [ ] Vista básica de tareas periódicas por edificio/zona.

### Qué QUEDA para Fase 2

- QR codes y deep linking.
- Campos personalizados en tareas (el snapshot en `work_order_tasks` ya está preparado).
- Import Excel masivo.
- Vista calendario.
- Peticiones adicionales: creación por cliente (rol Cliente desde web/app).
- Roles Cliente y Proveedor con sus vistas específicas.
- Gestión de vencimiento de tareas periódicas (instancias completa).
- API externa de reservas.
- Corrección de fichajes admin con audit UI.
- UI de conflictos de sync para admin.
- Reportería.
- Notificaciones avanzadas.

---

## 14. Riesgos Técnicos y Mitigaciones

### 1. Conflictos de sincronización offline
**Riesgo:** Dos usuarios completan el mismo servicio offline. Los datos del segundo no se aplican pero tampoco se pierden.
**Mitigación:**
- `clientOperationId` estricto para idempotencia.
- Campo `version` en `attendances`, `work_orders`, `service_executions` y `task_executions`.
- Política explícita: nunca sobreescribir un servicio ya `COMPLETED`.
- Guardar conflicto en `sync_conflicts` + notificar push + mantener datos locales.
- Panel admin para resolver conflictos manualmente.

### 2. Validación GPS (suplantación / spoofing)
**Riesgo:** Un usuario ficha desde fuera del edificio con coordenadas falsas.
**Mitigación:**
- Validación server-side de GPS contra `gps_radius_m` del edificio (nunca solo client-side).
- Guardar siempre `device_id` + IP + GPS real recibido en `attendances`.
- Radio configurable por edificio.
- Audit log de toda corrección.
- Alerta admin si hay demasiados rechazos GPS de un usuario.

### 3. Performance de fotos a escala
**Riesgo:** 500 fotos/día × historial de años = GB de almacenamiento y URLs lentas.
**Mitigación:**
- Compresión en cliente antes del upload (calidad 70-80%, max 1280px).
- Signed URLs de R2 generadas on-demand con TTL corto (no URLs permanentes expuestas).
- Nunca cargar fotos en listados (solo en detalle de tarea).
- Thumbnails para previews (generar al subir via BullMQ worker).
- Solo admin puede eliminar fotos (soft delete con `deleted_at`).

### 4. Tareas periódicas sin generación masiva
**Riesgo:** Si se intentan materializar todas las instancias futuras, la tabla crece exponencialmente.
**Mitigación:**
- Las instancias periódicas se crean **on-demand**: cuando el usuario ficha en el edificio, el backend calcula qué tareas corresponden al período actual y crea (o recupera) solo esa instancia.
- Función determinista: `shouldTaskAppearToday(task, today)` basada en `frequency` + `start_date`.
- Job nocturno solo para marcar instancias del período vencido como `EXPIRED` (no crea nuevas).

### 5. WebSockets a escala horizontal
**Riesgo:** Con múltiples instancias de la API, un cliente conectado a la instancia A no recibe eventos emitidos por la instancia B.
**Mitigación:**
- Redis Adapter para Socket.IO (ya disponible en el stack). Los eventos se publican en Redis Pub/Sub y todas las instancias los reciben.
- Sticky sessions en Railway si se escala horizontalmente (configurar load balancer).

### 6. Integración API externa desconocida
**Riesgo:** El proveedor externo cambia el formato del webhook sin previo aviso.
**Mitigación:**
- El endpoint inbound **siempre** guarda `raw_body` y `headers` antes de parsear nada.
- El parsing es una función independiente intercambiable (adapter pattern).
- `integration_inbound_logs` permite debuggear exactamente qué se recibió y cómo se interpretó.
- Agregar un nuevo adaptador no requiere cambiar el endpoint receptor.

### 7. Persistencia y sincronización SQLite en Android
**Riesgo:** La implementación offline puede volverse frágil en dispositivos Android de bajos recursos o versiones antiguas.
**Mitigación:**
- **MVP**: `expo-sqlite` + `SyncManager` propio. Control total del schema y las migrations, menor dependencia de librerías externas.
- Testear desde el primer sprint en dispositivos Android 8+ y gama baja.
- Queue de sync con reintentos exponenciales, máximo 5 intentos por operación con backoff.
- Si en Fase 2 aparecen problemas de performance (>1.000 registros locales, sync lento en gama baja), evaluar migración a **WatermelonDB**, que ofrece observers reactivos y queries más eficientes para datasets grandes.

### 8. Sesión JWT persistente en mobile
**Riesgo:** Access token corto expira durante uso offline; refresh token almacenado inseguramente.
**Mitigación:**
- Access token: 15 minutos. Refresh token: 90 días (o sin expiración configurable).
- Tokens almacenados en `expo-secure-store` (Keychain iOS / Keystore Android).
- Al detectar 401, el cliente intenta refresh automáticamente antes de desloguear.
- Si el refresh falla (revocado), se preservan datos locales y se pide re-login solo para operaciones que requieren conexión.

### 9. Ausencia de generación de tareas eventuales automáticas
**Riesgo:** Confundir tareas "eventuales" (frecuencia `EVENTUAL`) con tareas periódicas. Las eventuales solo aparecen en WOs, nunca en el módulo de tareas periódicas.
**Mitigación:**
- Separación estricta en el modelo: `frequency = EVENTUAL` excluye la tarea de cualquier cálculo periódico.
- Endpoint `/tasks/due-today` filtra por `frequency != EVENTUAL` para el módulo de tareas periódicas.
- Las eventuales solo se resuelven al consultar las tareas de una `service_execution`.

### 10. Railway cold starts en producción
**Riesgo:** Con plan básico de Railway, las instancias pueden hibernar y causar latencia en el primer request.
**Mitigación:**
- Health check endpoint `GET /health` con respuesta < 100ms.
- Railway configurado con health check activo para evitar hibernación.
- Worker de BullMQ en proceso separado (no afecta latencia de la API).
- Considerar upgrade a plan Railway Pro una vez en producción real.

---

## Preguntas abiertas

1. **Cliente y Proveedor en mobile:** ¿Van a usar la app móvil o solo la web admin? Las pantallas actuales están orientadas a limpiadores/encargados. Esto afectará la navegación y los flujos de Fase 2.

---

*Documento actualizado el 3 de junio de 2026 — v1.2.*
