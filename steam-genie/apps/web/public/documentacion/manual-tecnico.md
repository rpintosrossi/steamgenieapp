# Manual de usuario — Técnico / Limpiador

**Steam Genie** · App móvil  
Versión del documento: julio 2026

---

## Cómo usar este manual

Esta guía es para **técnicos y limpiadores** que trabajan en campo con la **app Steam Genie**. Está escrita en tono práctico: qué tocás, en qué orden, y qué hacer si algo falla.

---

## 1. ¿Qué vas a hacer con la app?

Con la app vas a:

- Elegir el **edificio** donde trabajás
- **Fichar entrada y salida** (presencia)
- **Aceptar y ejecutar servicios** (por ejemplo limpieza de checkout)
- Marcar **tareas del día** (periódicas)
- Consultar la **estructura del edificio**
- Reportar **insumos** faltantes y confirmar entregas
- **Sincronizar** si trabajaste sin señal

El panel web lo usan encargados y administración. Vos, en el día a día, usás la **app**.

---

## 2. Glosario rápido

| Término | En criollo |
|--------|------------|
| **Fichar entrada / salida** | Registrar que llegaste o te fuiste del edificio. |
| **Servicio** | Trabajo puntual asignado (checkout, pedido adicional, etc.). |
| **Checklist** | Lista de tareas del servicio que tenés que marcar. |
| **Tarea periódica** | Tarea del día que se repite (diaria, semanal…). |
| **Realizada / No realizada** | Si hiciste o no pudiste hacer una tarea. |
| **Motivo** | Por qué no se hizo (ej. habitación ocupada). |
| **Insumos** | Stock de productos del edificio. |
| **Sincronizar** | Subir al servidor lo que guardaste sin conexión. |
| **GPS / radio** | Distancia máxima para validar que estás en el edificio. |

---

## 3. Flujo típico de un día

1. Abrí la app → **Ingresar** con DNI y contraseña.
2. Elegí el **edificio**.
3. En **Fichaje** → **Fichar entrada** (con GPS encendido).
4. En **Servicios** → aceptá los pendientes.
5. Ejecutá servicios: **Iniciar** → **Checklist** → fotos → **Completar servicio**.
6. En **Tareas** → marcá las periódicas del día.
7. Si falta algo → **Insumos** → **Reportar**.
8. Al terminar → **Fichar salida**.
9. Si vas a otro edificio → **Cambiar edificio** y repetí.
10. Antes de irte, en **Perfil** confirmá que esté **Sincronizado** (o pendientes en 0).



---

## 4. Permisos y acceso

| Qué | Detalle |
|-----|---------|
| **Rol** | Limpiador (`cleaner`) |
| **Canal principal** | App móvil |
| **Panel web** | En general no lo usás. Solo podrías ver **Mis rendiciones** si te habilitan ese módulo y tenés liquidaciones. |
| **Edificios** | Solo ves los que te asignaron desde administración. |
| **Servicios** | Solo los que te asignaron. |
| **Tareas / insumos** | Del edificio seleccionado, y casi siempre **requieren estar fichado**. |

Si no te aparece un edificio o un servicio, pedile al encargado que revise tu usuario y las asignaciones.

---

## 5. Instalar e iniciar sesión

### 5.1 Instalar

Pedí el APK a tu encargado o descargalo desde el panel web (login o menú lateral). Instalá en Android y abrí **Steam Genie**.

### 5.2 Login

1. Pantalla **Iniciar sesión**.
2. Completá **DNI** y **Contraseña**.
3. Tocá **Ingresar**.

La primera vez necesitás **internet**.



### 5.3 Elegir edificio

Después del login:

1. Vas a ver **Hola, {tu nombre}**.
2. Buscá si hay muchos: **Buscar edificio...**
3. Tocá el edificio donde vas a trabajar.

En cada tarjeta podés ver:
- Dirección
- Badge GPS (`GPS 50m`, `Sin validación GPS`, `Sin GPS`)
- Si ya estás **Fichado** ahí
- Servicios pendientes de aceptar



---

## 6. Fichaje (entrada y salida)

Pestaña **Fichaje**.

### 6.1 Fichar entrada

1. Verificá que el GPS del teléfono esté **activado** y que Steam Genie tenga permiso de ubicación.
2. Tocá **Fichar entrada**.
3. Deberías ver **Fichado**, el reloj de **Tiempo trabajando** y la hora de entrada.

### 6.2 Fichar salida

Al terminar en ese edificio: **Fichar salida**.

### 6.3 GPS — mensajes frecuentes

| Situación | Qué te dice la app |
|-----------|--------------------|
| GPS apagado | Activá la ubicación en Configuración. |
| Sin permiso | Habilitá ubicación para Steam Genie. |
| No obtiene posición | Salí al exterior unos segundos y reintentá. |

Aunque el edificio diga **Sin validación GPS**, la app igual pide la ubicación del teléfono para registrar el fichaje. Si el edificio tiene radio (ej. **GPS 50m**), el servidor puede rechazar el fichaje si estás lejos.

### 6.4 Fichaje en otro edificio

Si ya estás fichado en otro sitio, al fichar acá la app avisa que se cerrará el fichaje anterior.

### 6.5 Sin conexión

Podés fichar **sin señal**: se guarda en el teléfono y se sincroniza después. Vas a ver el badge **Modo sin conexión**.



---

## 7. Servicios

Pestaña **Servicios** · título **Mis servicios**.

### 7.1 Lista

Filtros:
- **Activos** — asignados, aceptados o en progreso
- **Todos**

Tocá una tarjeta para abrir el detalle.

### 7.2 Flujo completo

```
Asignado → Aceptar (o Rechazar)
    → (tenés que estar fichado)
Iniciar servicio
    → Checklist (marcar tareas + fotos)
Completar servicio
```

#### Aceptar o rechazar

- **Aceptar servicio** o **Rechazar servicio**
- Si rechazás, elegí **Motivo de rechazo**
- Esto **requiere conexión**

#### Iniciar

Botón **Iniciar servicio** (solo si estás fichado en el edificio).

#### Checklist

1. Andá por plantas → zonas → subzonas.
2. Por cada tarea:
   - **Realizada** o **No realizada**
   - Si pide motivo: elegí en **Motivo de no realización**
   - Si pide foto: botón **Foto** (cámara)
3. Podés usar selección múltiple: **Seleccionar** → **Marcar N como realizada(s)** (las que piden campos individuales no entran en el lote).
4. Cuando esté completo: volvé al servicio.

#### Completar

**Completar servicio** → confirmá.

Si falta algo, la app te avisa (**Checklist incompleto** o **Falta foto obligatoria**) y te lleva a completar.



### 7.3 Qué funciona offline en servicios

| Acción | ¿Offline? |
|--------|-----------|
| Aceptar / rechazar | No |
| Iniciar | Sí (queda en cola) |
| Marcar checklist | Sí |
| Fotos del checklist | Sí (se suben después) |
| Completar servicio | Sí |

---

## 8. Tareas periódicas

Pestaña **Tareas** · **Tareas del día**.

1. Tenés que estar **fichado**. Si no: **Fichá para ver tus tareas**.
2. Navegá planta → zona → subzona (igual que el checklist).
3. Marcá **Hecho** o **No**.
4. Completá campos personalizados o motivos si te los pide.
5. Si una tarea queda **Realizada con foto pendiente**, sacá la foto.

> **Importante:** las fotos de tareas periódicas **necesitan conexión**. El resto de marcas sí se pueden encolar offline.



---

## 9. Edificio (catálogo)

Pestaña **Edificio**.

Es de **consulta**: ves plantas, zonas, subzonas y el catálogo de tareas con su frecuencia.  
**No ejecutás** tareas desde acá (eso es en **Tareas** o en el checklist de **Servicios**).

Si falta info: tirás hacia abajo para sincronizar.

---

## 10. Insumos

Pestaña **Insumos**.

Requisitos: edificio seleccionado + **fichaje activo**.

### 10.1 Reportar faltante

1. **Reportar**
2. Elegí producto, tipo (**Stock bajo** / **Sin stock** / **Observación**)
3. Observación opcional + foto opcional
4. **Enviar**

### 10.2 Confirmar entrega

Si hay **Entregas en camino**:
1. Revisá productos y fecha prevista
2. **Confirmar recepción**

Stock e insumos **requieren conexión**.



---

## 11. Perfil y sincronización

Pestaña **Perfil** · **Mi perfil**.

Ahí ves:
- Nombre, DNI, rol
- Edificio actual → **Cambiar edificio**
- Estado de sync: **Sincronizado** / **Pendiente (N)** / **Sin conexión** / **Error**
- **Sincronizar ahora**
- **Cerrar sesión**



---

## 12. Trabajo sin conexión

La barra superior puede decir:
- **Pendiente de sincronizar (N)**
- **Sin conexión**
- **Sincronizando...**
- **Error de sincronización**

**Sí offline:** fichaje, iniciar/completar servicio, checklist + fotos de servicio, marcar tareas periódicas (Hecho/No).

**No offline:** aceptar/rechazar servicio, fotos de tareas periódicas, insumos/alertas/entregas, primer login.

Al recuperar señal, la app sincroniza sola. Si queda trabado: **Perfil → Sincronizar ahora**.

---

## 13. FAQ — Técnico / Limpiador

**No me deja fichar**  
GPS encendido + permiso a la app. Si el edificio tiene radio, acercate al sitio. Probá afuera unos segundos.

**No veo tareas del día**  
¿Estás fichado en ese edificio? ¿Es el edificio correcto?

**No puedo iniciar un servicio**  
Primero aceptalo (con internet) y fichá entrada. Si está **Vencida**, solo se consulta.

**Dice “Realizada con foto pendiente”**  
Falta la foto obligatoria. Tocá **Foto**.

**Marqué cosas sin señal y no aparecen en oficina**  
Andá a **Perfil** y mirá pendientes. Conectate y tocá **Sincronizar ahora**.

**No puedo aceptar un servicio**  
Necesitás conexión. Pedile WiFi o datos al encargado si hace falta.

**Olvidé la contraseña**  
Pedile al administrador que te la resetee (suele basarse en la fecha de nacimiento DDMMYYYY al crear el usuario).

**¿Puedo usar la app en varios edificios el mismo día?**  
Sí: fichá salida (o la app cierra el fichaje anterior), **Cambiar edificio**, fichá entrada en el nuevo.

---

## 14. Checklist de buenas prácticas

- [ ] GPS y permisos listos antes de llegar
- [ ] Fichar entrada apenas llegás
- [ ] Aceptar servicios con señal
- [ ] Completar checklist y fotos antes de “Completar servicio”
- [ ] Revisar tareas periódicas del día
- [ ] Reportar insumos apenas falte algo
- [ ] Fichar salida
- [ ] Verificar sincronización en Perfil

---

*Steam Genie — Manual técnico/limpiador · Documento orientado a usuarios de la app móvil.*
