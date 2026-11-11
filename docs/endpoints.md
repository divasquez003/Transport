# Catálogo de endpoints de la API TransPort

La API REST (Node.js + Express) tiene **107 endpoints, todos implementados y probados**. Las rutas y sus permisos están en `api/src/routes.js`, y de ese mismo catálogo se generó este documento; `GET /api/salud` muestra el total en vivo.

- `api/pruebas/probar_api.mjs`: 356 verificaciones automáticas que recorren los 107 endpoints (`docker compose exec api npm test`).
- `docs/TransPort.postman_collection.json`: la demo en Postman, con pruebas en cada petición.

## Convenciones

**URL base:** `http://localhost:8091/api` (Postman y sistemas externos). La web usa la misma API en `http://localhost:8090/api`: nginx la reenvía al contenedor de Node y así la web y la API quedan en el mismo origen.

**Autenticación:** `POST /api/auth/login` devuelve un token JWT que dura 8 horas. Se envía en cada petición protegida:

```
Authorization: Bearer <token>
```

Los sistemas de terceros se identifican con `X-API-Key: <clave>` (rutas `/api/externo/...`) y GPS-Inversiones con `X-GPS-Token: <token>` (`POST /api/gps/eventos`).

**Formato de respuesta** (JSON, salvo las descargas CSV):

```json
{ "ok": true, "data": [ ], "paginacion": { "pagina": 1, "por_pagina": 20, "total": 25, "paginas": 2 } }
{ "ok": true, "mensaje": "Pedido registrado", "data": { } }
{ "ok": false, "mensaje": "Datos no válidos", "errores": { "fecha_entrega": "No puede ser una fecha pasada" } }
```

**Fechas:** hora de Guatemala (UTC-6). Fecha `AAAA-MM-DD`; fecha y hora `AAAA-MM-DD HH:MM` (los segundos son opcionales). Los montos están en quetzales.

**Paginación:** `?pagina=1&por_pagina=20` (máximo 100) en los listados que devuelven `paginacion`.

**Archivos CSV:** se descargan en UTF-8 con BOM y separados por comas, para abrirlos directo en Excel. Al importar se acepta coma o punto y coma.

**Códigos HTTP:**

| Código | Significado |
|---|---|
| 200 / 201 | Correcto / registro creado |
| 400 | El cuerpo no es un JSON válido, o el enlace para restablecer la contraseña venció |
| 401 | Falta el token (o la API key), es inválido o expiró |
| 403 | El rol no tiene permiso o el registro es de otro giro |
| 404 | No existe, o no le pertenece al cliente que lo pide |
| 405 | Método no permitido en esa ruta (la respuesta trae el encabezado `Allow`) |
| 409 | Conflicto: código repetido, fechas ocupadas, existencia insuficiente o cambio de estado no permitido |
| 413 | Archivo o petición de más de 2 MB |
| 422 | Datos no válidos (detalle en `errores`) |
| 500 / 503 | Error interno / MySQL no disponible |

**Grupos de acceso** (definidos en `api/src/middlewares/acceso.js`):

| Grupo | Roles |
|---|---|
| Público | Sin sesión |
| Público (con sesión muestra más datos) | Sin sesión; con el token del personal agrega datos internos |
| Con sesión | Cualquier usuario autenticado; los datos se filtran según su rol |
| Sede central | `dueno`, `admin_general` |
| Gestión | Sede central + `gerente`, `administrativo` |
| Ventas | Gestión + `vendedor` |
| Clientes y ventas | Ventas + `cliente` |
| Personal | Todos menos `cliente` |

Regla general: el personal de un giro solo ve y modifica datos de **su** giro; la sede central ve todos; el cliente solo ve lo suyo (si pide algo ajeno recibe `404`).

## Usuarios de demostración

Contraseña de todos: `Demo2026`

| Correo | Rol | Giro / cliente |
|---|---|---|
| dueno@transport.test | Dueño | Sede central |
| admin@transport.test | Administrador general | Sede central |
| gerente.mineria@transport.test | Gerente | Extracción minera |
| admin.mineria@transport.test | Administrativo | Extracción minera |
| operador.mineria@transport.test | Operativo | Extracción minera |
| gerente.proceso@transport.test | Gerente | Procesamiento de materia prima |
| admin.proceso@transport.test | Administrativo | Procesamiento de materia prima |
| ventas.proceso@transport.test | Vendedor | Procesamiento de materia prima |
| gerente.maquinaria@transport.test | Gerente | Venta y alquiler de maquinaria |
| ventas.maquinaria@transport.test | Vendedor | Venta y alquiler de maquinaria |
| gerente.transportemp@transport.test | Gerente | Transporte de materia prima |
| piloto.transportemp@transport.test | Operativo (piloto) | Transporte de materia prima |
| gerente.logistica@transport.test | Gerente | Transporte de productos |
| ventas.logistica@transport.test | Vendedor | Transporte de productos |
| piloto.logistica@transport.test | Operativo (piloto) | Transporte de productos |
| gerente.construccion@transport.test | Gerente | Servicios de construcción |
| ventas.construccion@transport.test | Vendedor | Servicios de construcción |
| laura@losaltos.test | Cliente | Constructora Los Altos, S.A. |
| jorge@elvolcan.test | Cliente | Distribuidora de Materiales El Volcán, S.A. |
| andres@vistahermosa.test | Cliente | Inmobiliaria Vista Hermosa, S.A. |
| oscar@cementeranorte.test | Cliente | Cementera del Norte, S.A. |
| john@pacifictrade.test | Cliente | Pacific Trade Logistics Inc. |

Para las integraciones: API key de demostración `tp_demo_cementera_2026` (Cementera del Norte, con los tres permisos) y token del servicio GPS `gps-demo-2026` (`GPS_TOKEN` en el `.env`).

## Flujos de estado

| Registro | Flujo | Reglas |
|---|---|---|
| Pedido de cliente | `pendiente → confirmado → en_proceso → despachado → entregado`; `cancelado` desde los tres primeros | El cliente solo cancela mientras está `pendiente`; cancelar pide motivo; al despachar se indica la sede y se descuenta su inventario |
| Pedido entre giros | `solicitado → aprobado → en_transito → recibido`; `rechazado` o `cancelado` | El proveedor aprueba, rechaza y despacha (sale de su inventario); el solicitante recibe (entra al suyo) o cancela |
| Reunión | `solicitada → confirmada → realizada`; `cancelada` | Queda confirmada al asignar el vendedor; si la agenda un vendedor nace confirmada |
| Alquiler | `reservado → activo → finalizado`; `reservado → cancelado` | Al entregar, la máquina queda `alquilada`; al devolverla vuelve a `disponible` y se cobran los días de atraso |
| Viaje | `programado → en_ruta → entregado`; `programado → cancelado` | El piloto solo mueve sus viajes; no sale un camión en mantenimiento; al entregar, el pedido pasa a `entregado` |
| Orden de producción | `planificada → en_proceso → finalizada`; `cancelada` | Registrar producción la inicia; lo producido entra al inventario y lo consumido sale |
| Proyecto | `cotizacion → en_ejecucion ⇄ suspendido`, `en_ejecucion → finalizado`; `cancelado` | El avance es acumulado y no baja; al finalizar queda al 100 % |
| Conversación | `abierta ⇄ cerrada` | Solo el personal la cierra; un mensaje nuevo la reabre |

## Ejemplos

**Pedido en línea** (cliente). Todos los productos deben ser del mismo giro; los de modalidad `cotizacion` piden agendar reunión y los alquileres se reservan en `/api/alquileres`.

```http
POST /api/pedidos
Authorization: Bearer <token de laura@losaltos.test>

{ "items": [ { "producto_id": 7, "cantidad": 50 }, { "producto_id": 12, "cantidad": 10 } ],
  "fecha_entrega": "2026-10-20", "direccion_entrega": "Obra zona 3, Quetzaltenango" }
```

Responde `201` con el pedido `PED-2026-000XX`, su detalle y el total (Q5,030.00). El gerente y los vendedores de la planta reciben la alerta *Nuevo pedido*, y si el cliente tiene un webhook de `pedido.creado`, su sistema recibe el aviso firmado.

**Despacho** (gerente o vendedor del giro): la mercadería sale del inventario de la sede indicada.

```http
PATCH /api/pedidos/{id}/estado

{ "estado": "despachado", "sede_id": 6, "comentario": "Sale en el camión P-123ABC" }
```

**Pedido entre giros** (la planta de proceso pide arcilla a minería):

```http
POST /api/pedidos-internos
Authorization: Bearer <token de gerente.proceso@transport.test>

{ "giro_proveedor_id": 1, "sede_solicitante_id": 6, "fecha_requerida": "2026-10-20",
  "prioridad": "alta", "items": [ { "producto_id": 4, "cantidad": 50 } ] }
```

Minería lo aprueba y lo despacha desde una de sus plantas (`{"estado": "en_transito", "sede_proveedora_id": 3}`); la planta de proceso lo marca `recibido` y la arcilla entra a su inventario.

**Alquiler de maquinaria:** primero se consulta la disponibilidad y luego se reserva.

```http
GET /api/maquinas/2/disponibilidad?fecha_inicio=2026-11-02&fecha_fin=2026-11-06

POST /api/alquileres
{ "maquina_id": 2, "fecha_inicio": "2026-11-02", "fecha_fin": "2026-11-06" }
```

**Eventos de GPS-Inversiones** (uno o un lote; la fecha es opcional y acepta hora local o ISO 8601 con zona):

```http
POST /api/gps/eventos
X-GPS-Token: gps-demo-2026

{ "eventos": [
  { "dispositivo": "GPSI-T-0148", "latitud": 14.9731, "longitud": -89.5302, "velocidad_kmh": 95, "motor_encendido": true },
  { "dispositivo": "GPSI-M-0032", "latitud": 14.6012, "longitud": -90.5521, "velocidad_kmh": 0, "motor_encendido": true, "horas_uso": 6121.5 }
] }
```

Reglas de alerta: un camión que pasa su velocidad máxima avisa al gerente del giro y al piloto del viaje en curso (máximo una alerta cada 15 minutos); una máquina disponible o en mantenimiento con el motor encendido genera *uso no autorizado*, y una alquilada o en uso que trabaja fuera del horario (`HORARIO_INICIO` a `HORARIO_FIN`) genera *uso fuera de horario* (las de maquinaria, máximo una por hora, al gerente y al administrativo del giro). `npm run simular-gps` envía un recorrido de prueba por la CA-9.

**Importar un archivo CSV (EDI):** como JSON o enviando el archivo directo con `Content-Type: text/csv`.

```http
POST /api/integraciones/edi/importar?tipo=inventario&archivo=conteo.csv
Content-Type: text/csv

sede_id;codigo_producto;cantidad
6;PRO-006;1250
```

| Tipo | Columnas obligatorias | Qué hace cada fila |
|---|---|---|
| `pedidos` | `referencia, nit, codigo_producto, cantidad` | Las filas con la misma referencia forman un pedido del cliente con ese NIT |
| `gastos` | `fecha, categoria, descripcion, monto` | Registra un gasto del giro (revisa el presupuesto) |
| `inventario` | `sede_id, codigo_producto, cantidad` | Ajusta la existencia al conteo físico |

Se procesan hasta 1,000 filas; cada fila con error se reporta con su número y no detiene a las demás.

**Webhooks:** TransPort envía un `POST` JSON a la URL del cliente con los encabezados `X-TransPort-Evento` y `X-TransPort-Firma: sha256=<HMAC del cuerpo con el secreto>`. El receptor comprueba la firma así (Node.js):

```js
const firma = 'sha256=' + crypto.createHmac('sha256', SECRETO).update(cuerpoRecibido).digest('hex')
const valida = crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(req.get('X-TransPort-Firma')))
```

Eventos: `pedido.creado`, `pedido.estado_cambiado`, `viaje.entregado`, `alquiler.estado_cambiado`.

**API para sistemas de terceros:** el ERP del cliente crea pedidos con el código del producto.

```http
POST /api/externo/pedidos
X-API-Key: tp_demo_cementera_2026

{ "items": [ { "codigo": "MIN-001", "cantidad": 28 } ], "direccion_entrega": "Planta Cobán" }
```

## Endpoints por módulo

| Módulo | Endpoints |
|---|---:|
| Sistema | 1 |
| Autenticación | 6 |
| Usuarios y roles | 5 |
| Giros de negocio y sedes (sala de ventas) | 7 |
| Catálogo de productos y servicios | 5 |
| Inventario por sede | 3 |
| Clientes | 4 |
| Pedidos en línea de clientes | 5 |
| Pedidos entre giros de negocio (abastecimiento) | 4 |
| Alertas, recordatorios y notificaciones push | 8 |
| Reuniones con vendedores para cerrar tratos | 5 |
| Mensajería cliente - empresa | 4 |
| Maquinaria: venta y alquiler | 8 |
| Transporte de materia prima y de productos | 7 |
| Producción: extracción minera y plantas de proceso | 5 |
| Construcción: proyectos y avances | 5 |
| Presupuesto y gastos por giro | 4 |
| GPS (GPS-Inversiones): recepción de eventos y consulta | 4 |
| Reportes para la toma de decisiones | 6 |
| Integración con sistemas de terceros (API REST, webhooks, CSV/EDI) | 8 |
| API para sistemas de terceros (encabezado X-API-Key) | 3 |
| **Total** | **107** |

### Sistema

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/salud` | Estado de la API, conexión a MySQL, número de endpoints, push y tareas programadas (503 si MySQL no responde) | Público |

### Autenticación

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `POST` | `/api/auth/login` | Iniciar sesión; devuelve el token JWT (8 horas) y los datos del usuario | Público |
| `POST` | `/api/auth/registro` | Registro de clientes desde el sitio web (persona o empresa); devuelve la sesión iniciada | Público |
| `GET` | `/api/auth/perfil` | Usuario de la sesión (rol, giro, sede o cliente) y alertas sin leer | Con sesión |
| `PUT` | `/api/auth/password` | Cambiar la contraseña (pide la actual; mínimo 8 caracteres) | Con sesión |
| `POST` | `/api/auth/recuperar` | Pedir el enlace para restablecer la contraseña (vale 30 minutos; con `APP_DEBUG=1` devuelve `token_desarrollo`) | Público |
| `POST` | `/api/auth/restablecer` | Nueva contraseña con el token del enlace (un solo uso) | Público |

### Usuarios y roles

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/usuarios` | Personal activo (filtros `rol`, `giro_id`, `sede_id`, `activo`); el gerente solo ve el de su giro | dueno, admin_general, gerente |
| `POST` | `/api/usuarios` | Crear empleado con rol, giro y sede (la sede debe ser del giro) | Sede central |
| `PUT` | `/api/usuarios/{id}` | Modificar datos, rol, giro, sede o contraseña (nadie cambia su propio rol) | Sede central |
| `PATCH` | `/api/usuarios/{id}/estado` | Activar o desactivar (`{"activo": false}`); pierde el acceso de inmediato | Sede central |
| `GET` | `/api/roles` | Los 7 roles del sistema | Sede central |

### Giros de negocio y sedes (sala de ventas)

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/giros` | Los seis giros con su número de sedes y productos | Público |
| `GET` | `/api/giros/{id}` | Página del giro en la sala de ventas: sedes, catálogo y, en maquinaria, la flota | Público |
| `PUT` | `/api/giros/{id}` | Modificar nombre, descripción, eslogan, imagen o estado del giro | Sede central |
| `GET` | `/api/sedes` | Sedes (filtros `giro_id`, `tipo`, `departamento`) | Público |
| `GET` | `/api/sedes/{id}` | Detalle de la sede; con sesión de personal agrega el resumen (personal, existencias, bajo mínimo) | Público (con sesión muestra más datos) |
| `POST` | `/api/sedes` | Crear sede (la sede central no lleva giro) | Sede central |
| `PUT` | `/api/sedes/{id}` | Modificar o desactivar una sede | Sede central |

### Catálogo de productos y servicios

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/productos` | Catálogo con filtros (`giro_id`, `tipo`, `modalidad`, `buscar`) y paginación; Gestión puede pedir `incluir_inactivos=1` | Público (con sesión muestra más datos) |
| `GET` | `/api/productos/{id}` | Detalle con la disponibilidad por sede | Público (con sesión muestra más datos) |
| `POST` | `/api/productos` | Crear producto o servicio (el gerente, solo en su giro; código único) | Gestión |
| `PUT` | `/api/productos/{id}` | Modificar solo los campos enviados; activar o desactivar | Gestión |
| `DELETE` | `/api/productos/{id}` | Baja lógica: sale del catálogo y conserva su historial | Gestión |

### Inventario por sede

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/inventario` | Existencias por sede y producto (filtros `sede_id`, `producto_id`, `giro_id`, `bajo_minimo=1`) | Personal |
| `POST` | `/api/inventario/movimientos` | Entrada, salida o ajuste (conteo físico); no permite existencias negativas y alerta al bajar del mínimo | Personal |
| `GET` | `/api/inventario/movimientos` | Kárdex con filtros (`sede_id`, `producto_id`, `tipo`, `desde`, `hasta`) y paginación | Personal |

### Clientes

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/clientes` | Clientes con total de pedidos y compras (filtros `buscar`, `tipo`, `activo`) y paginación | Personal |
| `GET` | `/api/clientes/{id}` | Ficha del cliente con sus contactos y su resumen por giro (el cliente solo ve la suya) | Con sesión |
| `POST` | `/api/clientes` | Registrar un cliente que llega a una sede; con `contacto` le crea acceso al portal | Ventas |
| `PUT` | `/api/clientes/{id}` | El cliente cambia su correo, teléfono y dirección; el personal, todos los datos | Con sesión |

### Pedidos en línea de clientes

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `POST` | `/api/pedidos` | Pedido en línea: productos de un solo giro y modalidad `en_linea` (ventas indica `cliente_id`); alerta al gerente y a los vendedores | Clientes y ventas |
| `GET` | `/api/pedidos` | Pedidos según el rol (filtros `estado`, `giro_id`, `cliente_id`, `vendedor_id`, `mios=1`, `desde`, `hasta`, `buscar`) | Con sesión |
| `GET` | `/api/pedidos/{id}` | Detalle con productos e historial de estados | Con sesión |
| `PATCH` | `/api/pedidos/{id}/estado` | Cambiar estado con el flujo validado; al despachar descuenta el inventario de la sede; alerta al cliente | Con sesión |
| `PATCH` | `/api/pedidos/{id}/vendedor` | Asignar un vendedor del giro; alerta al vendedor y al cliente | Gestión |

### Pedidos entre giros de negocio (abastecimiento)

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `POST` | `/api/pedidos-internos` | Pedir insumos a otro giro; alerta al giro proveedor (si es urgente, también a la sede central) | Gestión |
| `GET` | `/api/pedidos-internos` | Pedidos donde participa mi giro (filtros `estado`, `prioridad`, `rol=solicitante|proveedor`) | Personal |
| `GET` | `/api/pedidos-internos/{id}` | Detalle con productos e historial | Personal |
| `PATCH` | `/api/pedidos-internos/{id}/estado` | Aprobar, rechazar o despachar (proveedor: sale de su inventario); recibir o cancelar (solicitante: entra al suyo) | Gestión |

### Alertas, recordatorios y notificaciones push

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/alertas` | Mis alertas (`no_leidas=1`, `limite`) y el total sin leer | Con sesión |
| `PATCH` | `/api/alertas/leidas` | Marcar todas mis alertas como leídas | Con sesión |
| `PATCH` | `/api/alertas/{id}/leida` | Marcar una alerta como leída | Con sesión |
| `GET` | `/api/recordatorios` | Mis recordatorios (`pendientes=1`) | Con sesión |
| `POST` | `/api/recordatorios` | Programar un recordatorio (una vez, diario, semanal o mensual); a esa hora llega como alerta y notificación push | Con sesión |
| `DELETE` | `/api/recordatorios/{id}` | Eliminar un recordatorio propio | Con sesión |
| `GET` | `/api/notificaciones/clave-publica` | Llave pública VAPID para suscribir el navegador a las notificaciones push | Público |
| `POST` | `/api/notificaciones/suscripcion` | Guardar la suscripción Web Push del dispositivo (el objeto `PushSubscription` del navegador) | Con sesión |

### Reuniones con vendedores para cerrar tratos

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `POST` | `/api/reuniones` | El cliente solicita una reunión para cotizar; si la agenda un vendedor queda confirmada; alerta al gerente del giro | Clientes y ventas |
| `GET` | `/api/reuniones` | Reuniones según el rol (filtros `estado`, `giro_id`, `desde`, `mias=1`) | Con sesión |
| `GET` | `/api/reuniones/{id}` | Detalle de la reunión con el vendedor asignado | Con sesión |
| `PATCH` | `/api/reuniones/{id}/asignar` | Asignar vendedor, lugar o enlace y confirmar; alerta al vendedor y al cliente | Gestión |
| `PATCH` | `/api/reuniones/{id}/estado` | Marcar realizada o cancelada (el cliente solo cancela; el vendedor, solo las suyas) | Con sesión |

### Mensajería cliente - empresa

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/conversaciones` | Bandeja con el último mensaje y los no leídos (filtros `estado`, `giro_id`, `cliente_id`) | Con sesión |
| `POST` | `/api/conversaciones` | Iniciar una conversación con un giro (o con la sede central); alerta al personal | Clientes y ventas |
| `GET` | `/api/conversaciones/{id}/mensajes` | Mensajes de la conversación; los marca como leídos | Con sesión |
| `POST` | `/api/conversaciones/{id}/mensajes` | Responder (reabre si estaba cerrada); el personal puede cerrarla con `"cerrar": true` | Con sesión |

### Maquinaria: venta y alquiler

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/maquinas` | Flota (filtros `giro_id`, `sede_id`, `estado`, `tipo`); con `fecha_inicio` y `fecha_fin` indica cuáles están libres y el costo | Público (con sesión muestra más datos) |
| `POST` | `/api/maquinas` | Registrar una máquina con su servicio de alquiler y su GPS | Gestión |
| `GET` | `/api/maquinas/{id}` | Ficha con las próximas reservas; el personal ve además el GPS y el alquiler activo | Público (con sesión muestra más datos) |
| `PUT` | `/api/maquinas/{id}` | Modificar la máquina (tarifa, sede, estado, GPS); `alquilada` lo maneja el flujo de alquileres | Gestión |
| `GET` | `/api/maquinas/{id}/disponibilidad` | Disponibilidad, días y total estimado entre `fecha_inicio` y `fecha_fin` (por defecto, los próximos 30 días) | Público |
| `POST` | `/api/alquileres` | Reservar un alquiler sin traslapes; calcula días y total; alerta al giro de maquinaria | Clientes y ventas |
| `GET` | `/api/alquileres` | Alquileres según el rol (filtros `estado`, `maquina_id`, `cliente_id`, `giro_id`) | Con sesión |
| `PATCH` | `/api/alquileres/{id}/estado` | Entregar (`activo`), devolver (`finalizado`, cobra los días de atraso) o cancelar | Con sesión |

### Transporte de materia prima y de productos

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/vehiculos` | Flota de camiones con su última posición GPS (filtros `giro_id`, `estado`) | Personal |
| `POST` | `/api/vehiculos` | Registrar un camión con su dispositivo GPS | Gestión |
| `PUT` | `/api/vehiculos/{id}` | Modificar el camión (capacidad, velocidad máxima, sede, estado, GPS) | Gestión |
| `POST` | `/api/viajes` | Programar un viaje para un pedido, un pedido entre giros o un flete; valida ruta, piloto y capacidad; alerta al piloto | Gestión |
| `GET` | `/api/viajes` | Viajes según el rol (filtros `estado`, `giro_id`, `cliente_id`, `vehiculo_id`, `pedido_id`, `pedido_interno_id`, `desde`, `mios=1`) | Con sesión |
| `GET` | `/api/viajes/{id}` | Seguimiento: datos del viaje, última posición GPS y recorrido | Con sesión |
| `PATCH` | `/api/viajes/{id}/estado` | Salida (`en_ruta`), entrega (`entregado`, pasa el pedido a entregado) o cancelación | Personal |

### Producción: extracción minera y plantas de proceso

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `POST` | `/api/produccion/extraccion` | Registrar la extracción del turno; entra al inventario de la planta | Personal |
| `GET` | `/api/produccion/extraccion` | Registros por turno y total por materia prima (filtros `sede_id`, `producto_id`, `desde`, `hasta`) | Personal |
| `POST` | `/api/produccion/ordenes` | Crear una orden de producción en una planta de proceso | Gestión |
| `GET` | `/api/produccion/ordenes` | Órdenes de producción (filtros `sede_id`, `giro_id`, `estado`) | Personal |
| `PATCH` | `/api/produccion/ordenes/{id}` | Registrar producción (entra al inventario) y consumos de materia prima (salen); finalizar o cancelar | Personal |

### Construcción: proyectos y avances

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/proyectos` | Proyectos con el avance esperado según el plazo y su situación (atrasado, a tiempo, adelantado) | Con sesión |
| `POST` | `/api/proyectos` | Registrar un proyecto para un cliente; alerta al cliente | Gestión |
| `GET` | `/api/proyectos/{id}` | Ficha del proyecto con el historial de avances | Con sesión |
| `PUT` | `/api/proyectos/{id}` | Modificar datos o estado (cotización → en ejecución → suspendido, finalizado o cancelado) | Gestión |
| `POST` | `/api/proyectos/{id}/avances` | Registrar el avance acumulado (no puede bajar); alerta al cliente | Personal |

### Presupuesto y gastos por giro

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/presupuestos` | Presupuesto contra gastado por mes y categoría, con resumen (filtros `giro_id`, `anio`, `mes`) | Gestión |
| `POST` | `/api/presupuestos` | Asignar o reemplazar el presupuesto de un giro para un mes (general o por categoría) | Sede central |
| `GET` | `/api/gastos` | Gastos y su total (filtros `giro_id`, `sede_id`, `categoria`, `desde`, `hasta`) | Gestión |
| `POST` | `/api/gastos` | Registrar un gasto; alerta cuando el mes llega al 80 % y al 100 % del presupuesto | Gestión |

### GPS (GPS-Inversiones): recepción de eventos y consulta

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `POST` | `/api/gps/eventos` | Recibe eventos de GPS-Inversiones (uno o un lote de hasta 500); alertas de velocidad, uso no autorizado y fuera de horario | Servicio GPS (X-GPS-Token) |
| `GET` | `/api/gps/dispositivos` | Dispositivos con su última posición (filtros `giro_id`, `tipo=camion|maquinaria`) | Personal |
| `GET` | `/api/gps/dispositivos/{id}/posicion` | Última posición y minutos desde el último reporte | Personal |
| `GET` | `/api/gps/dispositivos/{id}/recorrido` | Puntos entre `desde` y `hasta` (por defecto, las últimas 24 horas) | Personal |

### Reportes para la toma de decisiones

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/reportes/consolidado` | Todos los giros: ingresos, gastos, resultado, presupuesto, tendencia de 6 meses y observaciones | Sede central |
| `GET` | `/api/reportes/giros/{id}` | Reporte de un giro: indicadores, ventas por mes, clientes, productos, gastos, inventario y datos propios del giro | Gestión |
| `GET` | `/api/reportes/ventas` | Ventas agrupadas (`agrupar=dia|mes|giro|cliente|vendedor|producto`) | Gestión |
| `GET` | `/api/reportes/presupuesto` | Presupuesto del año mes a mes y gastos por categoría (`anio`, `giro_id`) | Gestión |
| `GET` | `/api/reportes/clientes/{id}` | Estado de cuenta: compras por giro y por mes, últimos pedidos, alquileres, viajes y proyectos | Con sesión |
| `GET` | `/api/reportes/exportar` | Descarga en CSV para Excel (`reporte=consolidado|ventas|presupuesto|inventario`) | Gestión |

### Integración con sistemas de terceros (API REST, webhooks, CSV/EDI)

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/integraciones/api-claves` | API keys emitidas (prefijo, permisos y último uso; nunca la clave) | Sede central |
| `POST` | `/api/integraciones/api-claves` | Crear una API key para un cliente (`pedidos:leer`, `pedidos:crear`, `viajes:leer`); se muestra una sola vez | Sede central |
| `GET` | `/api/integraciones/webhooks` | Webhooks registrados y eventos disponibles | Sede central |
| `POST` | `/api/integraciones/webhooks` | Registrar un webhook de un cliente; devuelve el secreto para verificar la firma HMAC | Sede central |
| `DELETE` | `/api/integraciones/webhooks/{id}` | Eliminar un webhook | Sede central |
| `POST` | `/api/integraciones/edi/importar` | Importar un CSV de pedidos, gastos o inventario (JSON o `text/csv`); resultado fila por fila | Gestión |
| `GET` | `/api/integraciones/edi/exportar` | Exportar pedidos, viajes, inventario o movimientos en CSV (`tipo`, `desde`, `hasta`) | Gestión |
| `GET` | `/api/integraciones/bitacora` | Bitácora de API externa, webhooks, archivos y GPS (filtros `tipo`, `estado`, `cliente_id`) | Sede central |

### API para sistemas de terceros (encabezado X-API-Key)

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/api/externo/pedidos` | Pedidos del cliente dueño de la API key (filtros `estado`, `desde`, `hasta`) | API key con permiso pedidos:leer |
| `POST` | `/api/externo/pedidos` | Crear un pedido desde el sistema del cliente (acepta el `codigo` del producto) | API key con permiso pedidos:crear |
| `GET` | `/api/externo/viajes/{id}` | Seguimiento de un viaje del cliente con su posición GPS | API key con permiso viajes:leer |
