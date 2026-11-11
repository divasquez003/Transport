# Base de datos `transport_db`

MySQL 9.6 (también funciona en MySQL 8), juego de caracteres `utf8mb4`. El esquema cubre **todos los módulos** del sistema: 35 tablas y 2 vistas, y la API los usa todos.

| Script | Contenido |
|---|---|
| `database/01_esquema.sql` | Borra y vuelve a crear `transport_db` con todas las tablas, llaves, índices, restricciones `CHECK` y vistas |
| `database/02_datos_demo.sql` | Datos ficticios: 6 giros, 15 sedes, 25 productos, 22 usuarios, 6 clientes y cerca de seis meses de operaciones (71 pedidos, 120 viajes, 48 alquileres, gastos y presupuestos mensuales, extracción, proyectos con avances) |
| `database/03_usuario_app.sql` | Usuario `transport_app` que usa la API, solo con `SELECT, INSERT, UPDATE, DELETE` |

Volver a ejecutar los tres scripts deja la base como al inicio (paso 2 de `comandos.txt`). Las fechas de los datos de demostración se calculan desde el día en que se cargan, así los reportes del mes siempre tienen datos.

## Núcleo comercial

```mermaid
erDiagram
    ROLES ||--o{ USUARIOS : "da permisos"
    GIROS_NEGOCIO ||--o{ SEDES : tiene
    GIROS_NEGOCIO ||--o{ PRODUCTOS : vende
    GIROS_NEGOCIO ||--o{ USUARIOS : emplea
    SEDES ||--o{ USUARIOS : "trabajan en"
    CLIENTES ||--o{ USUARIOS : "acceden al portal"
    SEDES ||--o{ EXISTENCIAS : guarda
    PRODUCTOS ||--o{ EXISTENCIAS : "se almacena"
    EXISTENCIAS ||--o{ MOVIMIENTOS_INVENTARIO : "kárdex"
    CLIENTES ||--o{ PEDIDOS : hace
    GIROS_NEGOCIO ||--o{ PEDIDOS : atiende
    USUARIOS ||--o{ PEDIDOS : "vendedor asignado"
    PEDIDOS ||--|{ PEDIDO_DETALLE : contiene
    PRODUCTOS ||--o{ PEDIDO_DETALLE : "se pide"
    PEDIDOS ||--o{ PEDIDO_HISTORIAL : "registra estados"
    GIROS_NEGOCIO ||--o{ PEDIDOS_INTERNOS : "solicita o provee"
    PEDIDOS_INTERNOS ||--|{ PEDIDO_INTERNO_DETALLE : contiene
    PEDIDOS_INTERNOS ||--o{ PEDIDO_INTERNO_HISTORIAL : "registra estados"
    USUARIOS ||--o{ ALERTAS : recibe
    USUARIOS ||--o{ RECORDATORIOS : programa
    USUARIOS ||--o{ SUSCRIPCIONES_PUSH : "dispositivos"
    CLIENTES ||--o{ REUNIONES : solicita
    USUARIOS ||--o{ REUNIONES : "vendedor asignado"
    CLIENTES ||--o{ CONVERSACIONES : inicia
    CONVERSACIONES ||--o{ MENSAJES : contiene

    GIROS_NEGOCIO {
        tinyint id PK
        varchar codigo UK "MINERIA, PROCESO..."
        varchar nombre
    }
    SEDES {
        smallint id PK
        tinyint giro_id FK "NULL = sede central"
        enum tipo
        varchar departamento
    }
    USUARIOS {
        int id PK
        tinyint rol_id FK
        tinyint giro_id FK
        smallint sede_id FK
        int cliente_id FK
        varchar correo UK
        varchar password_hash
    }
    PRODUCTOS {
        int id PK
        tinyint giro_id FK
        varchar codigo UK
        enum tipo "producto, materia_prima, servicio, alquiler"
        decimal precio
        enum modalidad_venta "en_linea o cotizacion"
    }
    EXISTENCIAS {
        smallint sede_id PK
        int producto_id PK
        decimal cantidad
        decimal minimo
    }
    PEDIDOS {
        int id PK
        varchar codigo UK "PED-2026-00001"
        int cliente_id FK
        tinyint giro_id FK
        int vendedor_id FK
        enum estado
        decimal total
    }
    PEDIDOS_INTERNOS {
        int id PK
        varchar codigo UK "PI-2026-00001"
        tinyint giro_solicitante_id FK
        tinyint giro_proveedor_id FK
        enum estado
        enum prioridad
    }
    ALERTAS {
        bigint id PK
        int usuario_id FK
        varchar tipo
        enum prioridad
        varchar entidad
        tinyint leida
    }
```

## Operación de los giros, finanzas e integraciones

```mermaid
erDiagram
    GPS_DISPOSITIVOS ||--o{ GPS_EVENTOS : envia
    GPS_DISPOSITIVOS ||--o| MAQUINAS : monitorea
    GPS_DISPOSITIVOS ||--o| VEHICULOS : monitorea
    MAQUINAS ||--o{ ALQUILERES : "se alquila"
    CLIENTES ||--o{ ALQUILERES : contrata
    VEHICULOS ||--o{ VIAJES : realiza
    USUARIOS ||--o{ VIAJES : "piloto"
    PEDIDOS ||--o{ VIAJES : "se entrega en"
    PEDIDOS_INTERNOS ||--o{ VIAJES : "se traslada en"
    SEDES ||--o{ REGISTROS_EXTRACCION : produce
    SEDES ||--o{ ORDENES_PRODUCCION : fabrica
    CLIENTES ||--o{ PROYECTOS : contrata
    PROYECTOS ||--o{ PROYECTO_AVANCES : registra
    GIROS_NEGOCIO ||--o{ PRESUPUESTOS : asigna
    GIROS_NEGOCIO ||--o{ GASTOS : registra
    CLIENTES ||--o{ API_CLAVES : "integra su sistema"
    CLIENTES ||--o{ WEBHOOKS : "recibe eventos"
    CLIENTES ||--o{ INTEGRACION_BITACORA : "intercambios"
```

## Tablas por módulo

| Módulo | Tablas | Endpoints que las usan |
|---|---|---|
| Empresa y seguridad | `roles`, `giros_negocio`, `sedes`, `usuarios`, `clientes` | `/auth`, `/usuarios`, `/roles`, `/giros`, `/sedes`, `/clientes` |
| Catálogo e inventario | `productos`, `existencias`, `movimientos_inventario` | `/productos`, `/inventario` |
| Pedidos de clientes | `pedidos`, `pedido_detalle`, `pedido_historial` | `/pedidos`, `/externo/pedidos` |
| Pedidos entre giros | `pedidos_internos`, `pedido_interno_detalle`, `pedido_interno_historial` | `/pedidos-internos` |
| Alertas y comunicación | `alertas`, `recordatorios`, `suscripciones_push`, `reuniones`, `conversaciones`, `mensajes` | `/alertas`, `/recordatorios`, `/notificaciones`, `/reuniones`, `/conversaciones` |
| GPS, maquinaria y transporte | `gps_dispositivos`, `gps_eventos`, `maquinas`, `alquileres`, `vehiculos`, `viajes` | `/gps`, `/maquinas`, `/alquileres`, `/vehiculos`, `/viajes` |
| Producción y construcción | `registros_extraccion`, `ordenes_produccion`, `proyectos`, `proyecto_avances` | `/produccion`, `/proyectos` |
| Presupuesto | `presupuestos`, `gastos` | `/presupuestos`, `/gastos`, `/reportes` |
| Integraciones | `api_claves`, `webhooks`, `integracion_bitacora` | `/integraciones`, `/externo` |
| Vistas para reportes | `vw_ventas_por_giro_mes`, `vw_presupuesto_vs_gasto` | Consultas de apoyo para reportes |

## Reglas que cuida la base de datos

- Llaves foráneas en todas las relaciones; el detalle y el historial se borran junto con su pedido (`ON DELETE CASCADE`).
- `CHECK`: precio no negativo, cantidades mayores que cero, un pedido interno no puede pedirse al mismo giro, mes entre 1 y 12, avance entre 0 y 100, la fecha de fin de un alquiler no puede ser anterior a la de inicio.
- Valores únicos: códigos `PED-`, `PI-`, `ALQ-`, `VIA-`, `OP-` y `PRY-`; correo de usuario, NIT de cliente, código de producto y de máquina, placa de vehículo, código del dispositivo GPS (y un GPS por máquina o camión), un presupuesto por giro, mes y categoría, y una suscripción push por dispositivo.
- Índices en las consultas frecuentes: pedidos por giro y estado, alertas no leídas por usuario, eventos GPS por dispositivo y fecha, movimientos de inventario por sede y fecha, gastos por giro y fecha.

## Reglas que cuida la API

Lo que depende del rol o de varios registros a la vez se valida en `api/src/services/`, siempre dentro de una transacción:

- **Inventario:** ninguna salida deja la existencia en negativo; al despachar un pedido sale de la sede indicada; en un pedido entre giros sale de la sede proveedora al despachar y entra a la solicitante al recibir; la extracción y la producción entran al inventario de su planta y los consumos de materia prima salen. Cada cambio queda en `movimientos_inventario`.
- **Alquileres:** una máquina no se reserva dos veces en fechas que se traslapan (la reserva bloquea la fila de la máquina con `FOR UPDATE`).
- **Presupuesto:** cada gasto compara lo gastado del mes contra el presupuesto general y el de su categoría, y avisa al cruzar el 80 % y el 100 %.
- **Reportes:** en el consolidado las ventas entre giros no se suman como ingresos de la corporación (se muestran aparte, como ingresos internos); el ingreso de construcción se calcula por el avance de cada obra multiplicado por el monto del contrato.

## Flujos de estado

Pedido de cliente:

```mermaid
stateDiagram-v2
    [*] --> pendiente: en línea, por un vendedor o por API
    pendiente --> confirmado
    confirmado --> en_proceso
    en_proceso --> despachado: sale del inventario de la sede
    despachado --> entregado: también al entregar su viaje
    pendiente --> cancelado: cliente o personal (con motivo)
    confirmado --> cancelado: personal (con motivo)
    en_proceso --> cancelado: personal (con motivo)
    entregado --> [*]
    cancelado --> [*]
```

Pedido entre giros:

```mermaid
stateDiagram-v2
    [*] --> solicitado: giro solicitante
    solicitado --> aprobado: giro proveedor
    solicitado --> rechazado: giro proveedor (con motivo)
    solicitado --> cancelado: giro solicitante (con motivo)
    aprobado --> en_transito: proveedor despacha (sale de su inventario)
    aprobado --> cancelado: giro solicitante (con motivo)
    en_transito --> recibido: solicitante (entra a su inventario)
    recibido --> [*]
    rechazado --> [*]
    cancelado --> [*]
```

Alquiler de maquinaria y viaje:

```mermaid
stateDiagram-v2
    state "Alquiler de maquinaria" as Alquiler {
        state "reservado" as a_reservado
        state "activo" as a_activo
        state "finalizado" as a_finalizado
        state "cancelado" as a_cancelado
        [*] --> a_reservado: sin traslape de fechas
        a_reservado --> a_activo: entrega (la máquina queda alquilada)
        a_reservado --> a_cancelado: cliente o personal (con motivo)
        a_activo --> a_finalizado: devolución (cobra los días de atraso)
        a_finalizado --> [*]
        a_cancelado --> [*]
    }
    state "Viaje" as Viaje {
        state "programado" as v_programado
        state "en_ruta" as v_en_ruta
        state "entregado" as v_entregado
        state "cancelado" as v_cancelado
        [*] --> v_programado: vehículo, piloto y ruta del giro
        v_programado --> v_en_ruta: salida del piloto
        v_programado --> v_cancelado: con motivo
        v_en_ruta --> v_entregado: el pedido pasa a entregado
        v_entregado --> [*]
        v_cancelado --> [*]
    }
```
