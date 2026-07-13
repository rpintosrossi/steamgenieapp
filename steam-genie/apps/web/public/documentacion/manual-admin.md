# Manual de usuario — Administrador

**Steam Genie** · Panel web administrativo  
Versión del documento: julio 2026

---

## Cómo usar este manual

Este manual está pensado para quienes administran u operan Steam Genie desde el **panel web**. Te guía paso a paso: qué hace cada módulo, cómo usarlo en el día a día y qué tenés en cuenta para no trabarte.

---

## 1. ¿Qué es Steam Genie?

Steam Genie es el sistema para gestionar **limpieza y operaciones en edificios**: estructura de edificios, tareas periódicas y eventuales, fichajes del personal, stock de insumos, reportes y liquidaciones.

Como **administrador** (o encargado con permisos amplios) trabajás principalmente en el **panel web**. Los limpiadores trabajan en la **app móvil**; vos configurás, asignás, supervisás y liquidás desde la web.

---

## 2. Glosario

| Término | Qué significa |
|--------|----------------|
| **Edificio** | Sitio donde se presta el servicio (hotel, residencial, etc.). |
| **Planta** | Nivel del edificio (PB, 1, 2…). |
| **Zona** | Área dentro de una planta (habitación, pasillo, lobby…). |
| **Subzona** | Subdivisión opcional de una zona. Si una zona tiene subzonas, las tareas se asignan a la subzona. |
| **Tarea periódica** | Trabajo que se repite (diaria, semanal, etc.) y el limpiador marca en la app al fichar. |
| **Tarea eventual** | Trabajo puntual, típico de limpieza de checkout u órdenes especiales. |
| **Reserva** | Estadía de un huésped. Al crearla, el sistema genera un servicio de limpieza checkout. |
| **Servicio / orden de trabajo** | Trabajo asignable a limpiadores (checkout, pedido adicional, etc.). |
| **Fichaje** | Check-in / check-out del limpiador en un edificio (presencia). |
| **Depósito** | Inventario central de insumos. |
| **Monitoreo** | Vista del stock por edificio y alertas reportadas desde la app. |
| **Orden de envío** | Pedido de insumos del depósito hacia uno o más edificios. |
| **Rendición** | Liquidación de comisiones/gastos de un período, con PDF. |
| **Módulo** | Permiso de pantalla del panel (ej. Edificios, Reportes). Se configura en **Roles**. |
| **GPS / radio** | Distancia máxima (en metros) para validar que el limpiador está en el edificio al fichar. |

---

## 3. Flujo típico del administrador

Un día “completo” suele verse así:

1. **Ingresar** al panel con DNI y contraseña.
2. Revisar el **Inicio**: servicios pendientes, tareas vencidas, habitaciones no listas.
3. En **Trabajos eventuales → Reservas**: cargar check-outs del día / próximos.
4. En **Servicios**: asignar limpiadores a lo que quedó sin asignar.
5. En **Presencia**: ver quién fichó y cómo van las tareas del día.
6. En **Trabajos recurrentes**: controlar vencidos o atrasados.
7. En **Stock → Monitoreo**: atender alertas y generar **Órdenes de envío** si hace falta.
8. Al cierre de período: **Gastos y comisiones → Nueva comisión** y revisar **Rendiciones**.
9. Generar **Reportes** cuando operaciones o clientes lo pidan.



---

## 4. Roles y permisos (qué ve cada uno)

El menú lateral solo muestra lo que el usuario tiene habilitado. Eso se define en **Configuración → Roles**.

### 4.1 Roles de sistema (por defecto)

| Rol | Qué ve en el panel (resumen) |
|-----|------------------------------|
| **admin** | Todo. Usuarios, roles, configuración completa, operaciones y finanzas. |
| **manager** | Operaciones amplias: edificios, tareas, eventuales, recurrentes, presencia, stock, reportes, gastos/comisiones/rendiciones. **No** gestiona usuarios ni roles. |
| **client** | Inicio, tareas (consulta), trabajos recurrentes (consulta), check-in/out, nueva petición. |
| **provider** | Inicio y check-in/out (consulta). |
| **stock** | Inicio y módulo de stock (depósito). |
| **cleaner** | En web casi nada (la app móvil es su canal). Puede ver **Mis rendiciones** si tiene ese módulo y rendiciones propias. |

### 4.2 Módulos del panel

| Módulo | Etiqueta en el sistema |
|--------|------------------------|
| `dashboard` | Inicio |
| `buildings` | Edificios |
| `users` | Usuarios |
| `roles` | Roles y permisos |
| `tasks` | Tareas |
| `reservas` | Reservas |
| `servicios_eventuales` | Servicios eventuales |
| `ordenes_checkin` | Órdenes check-in / check-out |
| `peticion_servicio` | Nueva petición de servicio |
| `reportes` | Reportes |
| `trabajos_recurrentes` | Trabajos recurrentes |
| `presencia` | Presencia |
| `stock` | Stock (depósito) |
| `stock_monitoring` | Monitoreo de stock |
| `stock_shipments` | Órdenes de envío |
| `gastos_servicios` | Gastos de servicios *(botón en Servicios)* |
| `gastos_fijos` | Gastos fijos |
| `comisiones` | Comisiones |
| `rendiciones` | Rendiciones |
| `mis_rendiciones` | Mis rendiciones |

> **Tip:** Si alguien dice “no veo X en el menú”, casi siempre es un tema de **rol/módulos**, no un bug.

---

## 5. Acceso al panel

### 5.1 Iniciar sesión

1. Abrí la URL del panel web.
2. En **Iniciar sesión**, completá:
   - **DNI** (solo números)
   - **Contraseña**
3. Tocá **Ingresar**.



**Notas útiles**
- La contraseña inicial de un usuario nuevo suele ser la **fecha de nacimiento en formato DDMMYYYY**. Si no hay fecha, puede ser `01012000`.
- Cambiar la fecha de nacimiento después **no** cambia sola la contraseña.
- Si ves un error de acceso denegado, ese usuario no tiene módulos web habilitados (típico de limpiadores).

### 5.2 Cerrar sesión

En el pie del menú lateral: **Cerrar sesión**.

---

## 6. Inicio (Dashboard)

**Menú:** Inicio · **Ruta:** `/dashboard`

Ahí ves el pulso del día: servicios pendientes / en curso / completados, reservas próximas, habitaciones no listas, tareas vencidas, presencia activa, etc.

**Cómo usarlo**
1. Revisá los chips de indicadores.
2. Hacé clic en un chip para ir al módulo relacionado.
3. Usá **Actualizar indicadores** si necesitás refrescar.
4. Las tarjetas de módulos llevan a cada área con **Ir al módulo →**.

---

## 7. Configuración

**Menú:** Configuración · **Ruta:** `/configuracion`

Hub de la estructura maestra:

- **Edificios**
- **Usuarios**
- **Roles y permisos**
- **Tareas**

También podés (si sos admin/manager) probar **notificaciones push**: título, cuerpo y opcionalmente ID de usuario destino.



---

## 8. Edificios

**Menú:** Configuración → Edificios · **Ruta:** `/buildings`

### 8.1 Listado

1. Buscá por nombre, ciudad o dirección → **Buscar** (o **Limpiar**).
2. Marcá **Mostrar inactivos** si hace falta.
3. **Crear edificio** → completá **Nombre**\* y ubicación (provincia, ciudad, dirección, mapa GPS) → **Crear edificio**.
4. **Importar Excel** para carga masiva del catálogo.
5. En cada fila: **Gestionar** (detalle) o **Eliminar**.

Columnas típicas: Edificio, Ubicación, GPS (`Validación Xm` / `Sin GPS` / `Sin validación`), Alta, Estado.



### 8.2 Detalle del edificio

**Ruta:** `/buildings/[id]`

1. **← Volver a edificios**.
2. En **Configuración**: nombre, ubicación, mapa, **Edificio activo** → **Guardar configuración**.
3. Armá la jerarquía:
   - **Nueva planta** → **+ Planta**
   - En cada planta: **+ Zona**
   - Opcional: **+ Subzona**
4. Usá **Buscar en la estructura**, **Expandir todo** / **Colapsar todo**.
5. Gestioná usuarios asignados al edificio.
6. **Importar Excel** si necesitás cargar/actualizar la estructura.
7. **Ver tareas** te lleva al maestro de tareas.

> ⚠️ Si una zona tiene subzonas, **las tareas van en la subzona**, no en la zona padre.



---

## 9. Usuarios

**Menú:** Configuración → Usuarios · **Ruta:** `/users`

1. **Crear usuario** → DNI\*, Nombre completo\*, Fecha de nacimiento, Rol inicial → **Crear usuario**.
2. **Editar** → datos + **Usuario activo** → **Guardar cambios**.
3. **Gestionar Edificios** → elegí **Rol a asignar**, mové edificios disponibles ↔ asignados → **Guardar asignaciones**.
4. **Eliminar** (solo activos).

> **Importante para servicios:** para asignar a un servicio de limpieza, el usuario necesita rol **Limpiador** y edificio asignado. Un Administrador/Encargado no alcanza para esa asignación.



---

## 10. Roles y permisos

**Menú:** Configuración → Roles · **Ruta:** `/roles`

1. **Nuevo rol**: Nombre interno\* (minúsculas, números y `_`), Descripción, checkboxes de módulos → **Crear rol**.
2. En roles existentes: **Editar** / **Eliminar** (los de **Sistema** no se renombran ni eliminan).

Los módulos están agrupados (General, Configuración, Trabajos eventuales, Operaciones, Gastos y comisiones, etc.).



---

## 11. Tareas

**Menú:** Configuración → Tareas · **Ruta:** `/tasks`

Subnavegación: **Maestro de tareas** | **Categorías** | **Motivos de no realización**.

### 11.1 Maestro de tareas

1. Filtrá por nombre, edificio, frecuencia, estado → **Buscar**.
2. **Crear tarea**:
   - Ubicación: Edificio / Planta / Zona / Subzona
   - **Nombre**\*, **Frecuencia**\*
   - **Categoría** (opcional; para eventuales)
   - Opciones: **Requiere foto**, **Permite observación**, **Motivo si no se hace**
   - Campos personalizados si aplica
   - **Crear tarea**
3. Por fila: **Configurar**, **Activar** / **Desactivar**.

Las **periódicas** alimentan Trabajos recurrentes + app (pestaña Tareas).  
Las **eventuales** alimentan reservas/servicios de checkout y trabajos eventuales manuales.

### 11.2 Categorías (`/tasks/categorias`)

Sirven para agrupar tareas eventuales y filtrar checklists al crear un trabajo eventual.

1. **Nueva categoría** + **Orden** → **Agregar**.
2. **Editar** / **Desactivar** / **Eliminar** según necesites.

### 11.3 Motivos de no realización (`/tasks/motivos`)

Catálogo que ve el limpiador en la app cuando marca una tarea como **No realizada**.

1. **Texto del motivo** → **Agregar**.
2. Activar/desactivar/eliminar según corresponda.



---

## 12. Trabajos eventuales

**Menú:** Trabajos eventuales · **Ruta:** `/trabajos-eventuales`

Desde el hub podés:
- **Crear trabajo eventual** (servicio manual)
- Ir a **Reservas**, **Servicios** o **Calendario**

### 12.1 Crear trabajo eventual (modal)

1. Elegí **Edificio**, **Planta**, **Zona**.
2. Opcional: **Categorías** (sin selección = todas las eventuales de esa ubicación).
3. **Fecha y hora programada**.
4. Título y descripción opcionales.
5. **Crear trabajo eventual** → después asignalo en **Servicios**.

### 12.2 Reservas (`/trabajos-eventuales/reservas`)

Cada reserva genera un servicio **CHECKOUT_CLEANING**.

1. Completá: Edificio, Planta, Zona, Huésped, Referencia externa, **Check-in**\*, **Check-out**\*.
2. **Crear reserva**.
3. En el listado podés **Ocultar finalizadas**.
4. Prestá atención a los badges: **✔ Lista para habitar** / **⚠ Zona no lista**.

Estados típicos de reserva: Próxima, Día de check-in, En curso, Día de checkout, Finalizada.



### 12.3 Servicios (`/trabajos-eventuales/servicios`)

1. Filtrá por **Edificio**, **Estado**, orden de fecha.
2. Por servicio:
   - **Asignar** → marcá limpiadores → **Confirmar asignación**
   - **Gastos** (si tenés el módulo) → monto cobrado y gastos del servicio
   - **Eliminar** (no si está en curso o completado)

Estados: Sin asignar → Asignado (pendiente aceptación) → Aceptado → En curso → Completado (también Rechazado).

> El limpiador debe **aceptar en la app** después de la asignación.



### 12.4 Calendario (`/trabajos-eventuales/calendario`)

1. Marcá al menos un **Edificio**.
2. Filtrá planta/zona (si hay un solo edificio), trabajador, y qué mostrar (**Reservas** / **Servicios**).
3. Navegá con **← Anterior**, **Siguiente →**, **Hoy**.
4. Los servicios **Sin asignar** se destacan (parpadeo en rojo).

---

## 13. Trabajos recurrentes

**Menú:** Trabajos recurrentes → Listado de Trabajos · **Ruta:** `/trabajos-recurrentes/listado`

Seguimiento de tareas periódicas agrupadas por ubicación.

1. Filtrá: buscar tarea, edificio, estado general, fecha de referencia.
2. Expandí una fila de ubicación para ver cada tarea, frecuencia, quién la completó y fotos.
3. Estados de grupo: Completado, En curso, Programado, Vencido.
4. Estados por tarea: Realizada, No realizada, Omitida, Atrasada, Pendiente (+ “Realizada con foto pendiente”).



---

## 14. Presencia

**Menú:** Presencia → Timeline de Presencia · **Ruta:** `/presencia/timeline`

1. Filtrá **Fecha**, **Edificio**, **Trabajador** → **Actualizar**.
2. Revisá resumen: total de fichajes, **En curso**, barra de tareas del día, **En vivo** (solo hoy).
3. Por fichaje: Entrada / Salida, duración, progreso de tareas.
4. **▼ Ver tarea por tarea** para detalle y motivos de no realización.



---

## 15. Stock

**Menú:** Stock

### 15.1 Depósito (`/stock/inventario`)

Inventario central.

1. Revisá KPIs: Total productos, Stock bajo, Sin stock.
2. **Nuevo producto** (nombre, SKU, categoría, proveedor, cantidades, unidad).
3. Ajustes rápidos **−N** / **+N**, **Historial**, **Editar**, **Eliminar**.
4. Selección múltiple → **Ajuste masivo**.

### 15.2 Categorías y Proveedores

ABM simple: alta, orden (categorías), activar/desactivar, editar.

### 15.3 Monitoreo (`/stock/monitoreo`)

1. Revisá **Alertas y entregas**.
2. Elegí un edificio y consultá/ajustá stock por producto.
3. Desde una alerta podés saltar al stock del edificio.

### 15.4 Órdenes de envío (`/stock/envios`)

Flujo: **Borrador → Despachar → Confirmar entrega**.

1. **Nueva orden** → destinos (edificio + productos + cantidades) → **Crear borrador**.
2. Abrí la orden → asigná fechas de entrega → **Despachar orden**.
3. Cuando llega al edificio: **Confirmar entrega** (también se puede confirmar desde la app).



---

## 16. Gastos y comisiones

**Menú:** Gastos y comisiones

### 16.1 Gastos fijos

Concepto, monto, desde/hasta, alcance Global o por edificio → **Crear gasto fijo**.

### 16.2 Nueva comisión (wizard)

1. **Beneficiario**: usuario del sistema o persona externa + período.
2. **Servicios**: filtrá, seleccioná, editá gastos si hace falta → **Calcular**.
3. **Cálculo**: revisá prorrateo de gastos fijos y **% de comisión** → **Generar rendición y PDF**.
4. **Resultado**: descargar PDF o ver detalle.

> No avanza si falta **monto cobrado** en algún servicio seleccionado.

### 16.3 Rendiciones

Listado con filtros por beneficiario y fechas. **Ver** detalle, ajustar % / gastos fijos y regenerar PDF.



---

## 17. Reportes

**Menú:** Reportes

| Vista | Para qué |
|-------|----------|
| **Por fecha** | Actividad diaria por trabajador (edificios y zonas). |
| **Por trabajador** | Horas fichadas, tiempo por zona, campos de reporte. |
| **Por edificio** | Servicios y tareas recurrentes del edificio. |

En todas: elegí filtros → **Generar reporte** y, si hace falta, **Exportar CSV**.



---

## 18. FAQ — Administrador

**¿Por qué un usuario no ve un menú?**  
Revisá su rol en **Usuarios** y los módulos en **Roles**.

**¿Por qué no puedo asignar un limpiador a un servicio?**  
Debe tener rol Limpiador y el edificio asignado. Revisá también que el servicio esté en un estado asignable.

**¿La reserva no generó servicio?**  
Confirmá edificio + planta + zona y que existan tareas eventuales en esa ubicación.

**¿El limpiador dice que no ve tareas?**  
Tiene que estar **fichado** en ese edificio. Además las tareas periódicas deben estar activas y corresponder al día/frecuencia.

**¿Cómo cargo muchos edificios/zonas de una vez?**  
Usá **Importar Excel** desde Edificios o desde el detalle del edificio.

**¿Dónde cargo el monto cobrado al cliente?**  
En **Servicios → Gastos** (módulo `gastos_servicios`). Es necesario antes de armar una comisión.

**¿Puedo trabajar sin GPS en un edificio?**  
Podés configurar el edificio sin validación GPS. Igual la app móvil suele pedir ubicación del teléfono para registrar el fichaje.

**¿Dónde descargo la app para operarios?**  
En el login y en el pie del menú lateral del panel (descarga APK).

---

## 19. Buenas prácticas

1. Primero estructura (**edificios → plantas/zonas**) y después **tareas**.
2. Creá usuarios limpiadores con edificios antes de asignar servicios.
3. Revisá a diario el calendario/servicios **sin asignar**.
4. No borres masivamente (tareas/órdenes) salvo emergencia: pedirá tokens de confirmación.
5. Antes de liquidar, completá montos cobrados y gastos de cada servicio.
6. Cuando algo “no aparece”, mirá filtros (edificio, fechas, “mostrar inactivos”) antes de asumir un error.

---

*Steam Genie — Manual administrador · Documento orientado a usuarios del panel web.*
