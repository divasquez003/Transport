DROP DATABASE IF EXISTS transport_db;
CREATE DATABASE transport_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE transport_db;

CREATE TABLE roles (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(60) NOT NULL,
    descripcion VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE giros_negocio (
    id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(80) NOT NULL,
    descripcion TEXT NULL,
    slogan VARCHAR(150) NULL,
    imagen_url VARCHAR(255) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE sedes (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    giro_id TINYINT UNSIGNED NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo ENUM('central','planta_extraccion','planta_proceso','sucursal','base_operaciones','oficina_proyectos','bodega') NOT NULL,
    departamento VARCHAR(50) NOT NULL,
    municipio VARCHAR(60) NULL,
    direccion VARCHAR(200) NULL,
    telefono VARCHAR(20) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_sedes_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id)
) ENGINE=InnoDB;

CREATE TABLE clientes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tipo ENUM('empresa','persona') NOT NULL DEFAULT 'empresa',
    nombre VARCHAR(150) NOT NULL,
    nit VARCHAR(20) NULL UNIQUE,
    correo VARCHAR(120) NULL,
    telefono VARCHAR(20) NULL,
    direccion VARCHAR(200) NULL,
    es_extranjero TINYINT(1) NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE usuarios (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    rol_id TINYINT UNSIGNED NOT NULL,
    giro_id TINYINT UNSIGNED NULL,
    sede_id SMALLINT UNSIGNED NULL,
    cliente_id INT UNSIGNED NULL,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(120) NOT NULL UNIQUE,
    telefono VARCHAR(20) NULL,
    password_hash VARCHAR(255) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    ultimo_acceso DATETIME NULL,
    reset_token_hash CHAR(64) NULL,
    reset_expira DATETIME NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles (id),
    CONSTRAINT fk_usuarios_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_usuarios_sede FOREIGN KEY (sede_id) REFERENCES sedes (id),
    CONSTRAINT fk_usuarios_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id),
    INDEX idx_usuarios_giro_rol (giro_id, rol_id)
) ENGINE=InnoDB;

CREATE TABLE productos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    giro_id TINYINT UNSIGNED NOT NULL,
    codigo VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT NULL,
    tipo ENUM('producto','materia_prima','servicio','alquiler') NOT NULL,
    unidad_medida VARCHAR(20) NOT NULL,
    precio DECIMAL(12,2) NOT NULL DEFAULT 0,
    modalidad_venta ENUM('en_linea','cotizacion') NOT NULL DEFAULT 'en_linea',
    imagen_url VARCHAR(255) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_productos_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT chk_productos_precio CHECK (precio >= 0),
    INDEX idx_productos_giro (giro_id, activo)
) ENGINE=InnoDB;

CREATE TABLE existencias (
    sede_id SMALLINT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED NOT NULL,
    cantidad DECIMAL(14,2) NOT NULL DEFAULT 0,
    minimo DECIMAL(14,2) NOT NULL DEFAULT 0,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (sede_id, producto_id),
    CONSTRAINT fk_existencias_sede FOREIGN KEY (sede_id) REFERENCES sedes (id),
    CONSTRAINT fk_existencias_producto FOREIGN KEY (producto_id) REFERENCES productos (id)
) ENGINE=InnoDB;

CREATE TABLE movimientos_inventario (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sede_id SMALLINT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED NOT NULL,
    tipo ENUM('entrada','salida','ajuste') NOT NULL,
    cantidad DECIMAL(14,2) NOT NULL,
    referencia VARCHAR(60) NULL,
    usuario_id INT UNSIGNED NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_movinv_sede FOREIGN KEY (sede_id) REFERENCES sedes (id),
    CONSTRAINT fk_movinv_producto FOREIGN KEY (producto_id) REFERENCES productos (id),
    CONSTRAINT fk_movinv_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    INDEX idx_movinv_fecha (sede_id, creado_en)
) ENGINE=InnoDB;

CREATE TABLE pedidos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NULL UNIQUE,
    cliente_id INT UNSIGNED NOT NULL,
    giro_id TINYINT UNSIGNED NOT NULL,
    sede_id SMALLINT UNSIGNED NULL,
    vendedor_id INT UNSIGNED NULL,
    estado ENUM('pendiente','confirmado','en_proceso','despachado','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    direccion_entrega VARCHAR(200) NULL,
    fecha_entrega DATE NULL,
    observaciones VARCHAR(500) NULL,
    creado_por INT UNSIGNED NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id),
    CONSTRAINT fk_pedidos_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_pedidos_sede FOREIGN KEY (sede_id) REFERENCES sedes (id),
    CONSTRAINT fk_pedidos_vendedor FOREIGN KEY (vendedor_id) REFERENCES usuarios (id),
    CONSTRAINT fk_pedidos_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id),
    INDEX idx_pedidos_giro_estado (giro_id, estado),
    INDEX idx_pedidos_cliente (cliente_id, creado_en)
) ENGINE=InnoDB;

CREATE TABLE pedido_detalle (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED NOT NULL,
    cantidad DECIMAL(12,2) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(14,2) NOT NULL,
    CONSTRAINT fk_peddet_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON DELETE CASCADE,
    CONSTRAINT fk_peddet_producto FOREIGN KEY (producto_id) REFERENCES productos (id),
    CONSTRAINT chk_peddet_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;

CREATE TABLE pedido_historial (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT UNSIGNED NOT NULL,
    estado_anterior VARCHAR(20) NULL,
    estado_nuevo VARCHAR(20) NOT NULL,
    usuario_id INT UNSIGNED NULL,
    comentario VARCHAR(255) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pedhis_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON DELETE CASCADE,
    CONSTRAINT fk_pedhis_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB;

CREATE TABLE pedidos_internos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NULL UNIQUE,
    giro_solicitante_id TINYINT UNSIGNED NOT NULL,
    sede_solicitante_id SMALLINT UNSIGNED NOT NULL,
    giro_proveedor_id TINYINT UNSIGNED NOT NULL,
    sede_proveedora_id SMALLINT UNSIGNED NULL,
    solicitado_por INT UNSIGNED NOT NULL,
    atendido_por INT UNSIGNED NULL,
    estado ENUM('solicitado','aprobado','en_transito','recibido','rechazado','cancelado') NOT NULL DEFAULT 'solicitado',
    prioridad ENUM('baja','media','alta','urgente') NOT NULL DEFAULT 'media',
    fecha_requerida DATE NOT NULL,
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    observaciones VARCHAR(500) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pedint_giro_sol FOREIGN KEY (giro_solicitante_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_pedint_sede_sol FOREIGN KEY (sede_solicitante_id) REFERENCES sedes (id),
    CONSTRAINT fk_pedint_giro_prov FOREIGN KEY (giro_proveedor_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_pedint_sede_prov FOREIGN KEY (sede_proveedora_id) REFERENCES sedes (id),
    CONSTRAINT fk_pedint_solicitado FOREIGN KEY (solicitado_por) REFERENCES usuarios (id),
    CONSTRAINT fk_pedint_atendido FOREIGN KEY (atendido_por) REFERENCES usuarios (id),
    CONSTRAINT chk_pedint_giros CHECK (giro_solicitante_id <> giro_proveedor_id),
    INDEX idx_pedint_proveedor (giro_proveedor_id, estado),
    INDEX idx_pedint_solicitante (giro_solicitante_id, estado)
) ENGINE=InnoDB;

CREATE TABLE pedido_interno_detalle (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pedido_interno_id INT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED NOT NULL,
    cantidad DECIMAL(12,2) NOT NULL,
    costo_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(14,2) NOT NULL,
    CONSTRAINT fk_pidet_pedido FOREIGN KEY (pedido_interno_id) REFERENCES pedidos_internos (id) ON DELETE CASCADE,
    CONSTRAINT fk_pidet_producto FOREIGN KEY (producto_id) REFERENCES productos (id),
    CONSTRAINT chk_pidet_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;

CREATE TABLE pedido_interno_historial (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pedido_interno_id INT UNSIGNED NOT NULL,
    estado_anterior VARCHAR(20) NULL,
    estado_nuevo VARCHAR(20) NOT NULL,
    usuario_id INT UNSIGNED NULL,
    comentario VARCHAR(255) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pihis_pedido FOREIGN KEY (pedido_interno_id) REFERENCES pedidos_internos (id) ON DELETE CASCADE,
    CONSTRAINT fk_pihis_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB;

CREATE TABLE alertas (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    mensaje VARCHAR(500) NOT NULL,
    prioridad ENUM('baja','media','alta') NOT NULL DEFAULT 'media',
    entidad VARCHAR(30) NULL,
    entidad_id INT UNSIGNED NULL,
    leida TINYINT(1) NOT NULL DEFAULT 0,
    leida_en DATETIME NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_alertas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    INDEX idx_alertas_usuario (usuario_id, leida, creado_en)
) ENGINE=InnoDB;

CREATE TABLE recordatorios (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    titulo VARCHAR(150) NOT NULL,
    descripcion VARCHAR(500) NULL,
    fecha_hora DATETIME NOT NULL,
    repeticion ENUM('ninguna','diaria','semanal','mensual') NOT NULL DEFAULT 'ninguna',
    enviado TINYINT(1) NOT NULL DEFAULT 0,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recordatorios_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
    INDEX idx_recordatorios_pendientes (enviado, fecha_hora)
) ENGINE=InnoDB;

CREATE TABLE suscripciones_push (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(100) NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_suspush_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT uq_suspush_endpoint UNIQUE (endpoint)
) ENGINE=InnoDB;

CREATE TABLE reuniones (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT UNSIGNED NOT NULL,
    giro_id TINYINT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED NULL,
    vendedor_id INT UNSIGNED NULL,
    solicitado_por INT UNSIGNED NULL,
    asunto VARCHAR(150) NOT NULL,
    fecha_hora DATETIME NOT NULL,
    modalidad ENUM('presencial','videoconferencia') NOT NULL DEFAULT 'presencial',
    lugar VARCHAR(200) NULL,
    enlace VARCHAR(255) NULL,
    estado ENUM('solicitada','confirmada','realizada','cancelada') NOT NULL DEFAULT 'solicitada',
    notas VARCHAR(500) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_reuniones_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id),
    CONSTRAINT fk_reuniones_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_reuniones_producto FOREIGN KEY (producto_id) REFERENCES productos (id),
    CONSTRAINT fk_reuniones_vendedor FOREIGN KEY (vendedor_id) REFERENCES usuarios (id),
    CONSTRAINT fk_reuniones_solicitado FOREIGN KEY (solicitado_por) REFERENCES usuarios (id),
    INDEX idx_reuniones_giro (giro_id, estado, fecha_hora)
) ENGINE=InnoDB;

CREATE TABLE conversaciones (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT UNSIGNED NOT NULL,
    giro_id TINYINT UNSIGNED NULL,
    asunto VARCHAR(150) NOT NULL,
    estado ENUM('abierta','cerrada') NOT NULL DEFAULT 'abierta',
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conv_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id),
    CONSTRAINT fk_conv_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id)
) ENGINE=InnoDB;

CREATE TABLE mensajes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversacion_id INT UNSIGNED NOT NULL,
    usuario_id INT UNSIGNED NOT NULL,
    contenido TEXT NOT NULL,
    leido TINYINT(1) NOT NULL DEFAULT 0,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mensajes_conv FOREIGN KEY (conversacion_id) REFERENCES conversaciones (id) ON DELETE CASCADE,
    CONSTRAINT fk_mensajes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB;

CREATE TABLE gps_dispositivos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo_externo VARCHAR(50) NOT NULL UNIQUE,
    tipo ENUM('camion','maquinaria') NOT NULL,
    descripcion VARCHAR(100) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE gps_eventos (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dispositivo_id INT UNSIGNED NOT NULL,
    latitud DECIMAL(10,7) NOT NULL,
    longitud DECIMAL(10,7) NOT NULL,
    velocidad_kmh DECIMAL(6,2) NULL,
    motor_encendido TINYINT(1) NULL,
    horas_uso DECIMAL(10,2) NULL,
    registrado_en DATETIME NOT NULL,
    recibido_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gpsev_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES gps_dispositivos (id) ON DELETE CASCADE,
    INDEX idx_gpsev_dispositivo (dispositivo_id, registrado_en)
) ENGINE=InnoDB;

CREATE TABLE maquinas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    giro_id TINYINT UNSIGNED NOT NULL,
    sede_id SMALLINT UNSIGNED NULL,
    producto_id INT UNSIGNED NULL,
    gps_dispositivo_id INT UNSIGNED NULL UNIQUE,
    codigo VARCHAR(30) NOT NULL UNIQUE,
    tipo VARCHAR(60) NOT NULL,
    marca VARCHAR(60) NULL,
    modelo VARCHAR(60) NULL,
    anio SMALLINT UNSIGNED NULL,
    estado ENUM('disponible','alquilada','en_uso','mantenimiento','vendida') NOT NULL DEFAULT 'disponible',
    tarifa_diaria DECIMAL(12,2) NULL,
    precio_venta DECIMAL(14,2) NULL,
    horometro DECIMAL(10,1) NULL,
    CONSTRAINT fk_maquinas_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_maquinas_sede FOREIGN KEY (sede_id) REFERENCES sedes (id),
    CONSTRAINT fk_maquinas_producto FOREIGN KEY (producto_id) REFERENCES productos (id),
    CONSTRAINT fk_maquinas_gps FOREIGN KEY (gps_dispositivo_id) REFERENCES gps_dispositivos (id)
) ENGINE=InnoDB;

CREATE TABLE alquileres (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NULL UNIQUE,
    maquina_id INT UNSIGNED NOT NULL,
    cliente_id INT UNSIGNED NOT NULL,
    vendedor_id INT UNSIGNED NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    fecha_devolucion DATE NULL,
    tarifa_diaria DECIMAL(12,2) NOT NULL,
    total DECIMAL(14,2) NOT NULL,
    estado ENUM('reservado','activo','finalizado','cancelado') NOT NULL DEFAULT 'reservado',
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_alquileres_maquina FOREIGN KEY (maquina_id) REFERENCES maquinas (id),
    CONSTRAINT fk_alquileres_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id),
    CONSTRAINT fk_alquileres_vendedor FOREIGN KEY (vendedor_id) REFERENCES usuarios (id),
    CONSTRAINT chk_alquileres_fechas CHECK (fecha_fin >= fecha_inicio)
) ENGINE=InnoDB;

CREATE TABLE vehiculos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    giro_id TINYINT UNSIGNED NOT NULL,
    sede_id SMALLINT UNSIGNED NULL,
    gps_dispositivo_id INT UNSIGNED NULL UNIQUE,
    placa VARCHAR(15) NOT NULL UNIQUE,
    tipo VARCHAR(40) NOT NULL,
    capacidad_ton DECIMAL(6,2) NULL,
    velocidad_maxima_kmh SMALLINT UNSIGNED NOT NULL DEFAULT 80,
    estado ENUM('disponible','en_ruta','mantenimiento','inactivo') NOT NULL DEFAULT 'disponible',
    CONSTRAINT fk_vehiculos_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_vehiculos_sede FOREIGN KEY (sede_id) REFERENCES sedes (id),
    CONSTRAINT fk_vehiculos_gps FOREIGN KEY (gps_dispositivo_id) REFERENCES gps_dispositivos (id)
) ENGINE=InnoDB;

CREATE TABLE viajes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NULL UNIQUE,
    giro_id TINYINT UNSIGNED NOT NULL,
    vehiculo_id INT UNSIGNED NOT NULL,
    piloto_id INT UNSIGNED NULL,
    cliente_id INT UNSIGNED NULL,
    pedido_id INT UNSIGNED NULL,
    pedido_interno_id INT UNSIGNED NULL,
    tipo_ruta ENUM('materia_prima','inter_puertos','inter_fronteras','puerto_bodega','bodega_puerto','local') NOT NULL,
    origen VARCHAR(150) NOT NULL,
    destino VARCHAR(150) NOT NULL,
    carga_descripcion VARCHAR(200) NULL,
    peso_ton DECIMAL(8,2) NULL,
    salida_programada DATETIME NULL,
    salida_real DATETIME NULL,
    llegada_real DATETIME NULL,
    estado ENUM('programado','en_ruta','entregado','cancelado') NOT NULL DEFAULT 'programado',
    tarifa DECIMAL(12,2) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_viajes_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_viajes_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id),
    CONSTRAINT fk_viajes_piloto FOREIGN KEY (piloto_id) REFERENCES usuarios (id),
    CONSTRAINT fk_viajes_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id),
    CONSTRAINT fk_viajes_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos (id),
    CONSTRAINT fk_viajes_pedido_int FOREIGN KEY (pedido_interno_id) REFERENCES pedidos_internos (id),
    INDEX idx_viajes_estado (giro_id, estado)
) ENGINE=InnoDB;

CREATE TABLE registros_extraccion (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sede_id SMALLINT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    turno ENUM('diurno','nocturno') NOT NULL DEFAULT 'diurno',
    cantidad DECIMAL(12,2) NOT NULL,
    registrado_por INT UNSIGNED NULL,
    observaciones VARCHAR(255) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_extr_sede FOREIGN KEY (sede_id) REFERENCES sedes (id),
    CONSTRAINT fk_extr_producto FOREIGN KEY (producto_id) REFERENCES productos (id),
    CONSTRAINT fk_extr_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB;

CREATE TABLE ordenes_produccion (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NULL UNIQUE,
    sede_id SMALLINT UNSIGNED NOT NULL,
    producto_id INT UNSIGNED NOT NULL,
    cantidad_planificada DECIMAL(12,2) NOT NULL,
    cantidad_producida DECIMAL(12,2) NOT NULL DEFAULT 0,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NULL,
    estado ENUM('planificada','en_proceso','finalizada','cancelada') NOT NULL DEFAULT 'planificada',
    creado_por INT UNSIGNED NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ordprod_sede FOREIGN KEY (sede_id) REFERENCES sedes (id),
    CONSTRAINT fk_ordprod_producto FOREIGN KEY (producto_id) REFERENCES productos (id),
    CONSTRAINT fk_ordprod_usuario FOREIGN KEY (creado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB;

CREATE TABLE proyectos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NULL UNIQUE,
    giro_id TINYINT UNSIGNED NOT NULL,
    cliente_id INT UNSIGNED NOT NULL,
    responsable_id INT UNSIGNED NULL,
    nombre VARCHAR(150) NOT NULL,
    tipo ENUM('puente','carretera','edificio','otro') NOT NULL,
    ubicacion VARCHAR(200) NOT NULL,
    monto_contrato DECIMAL(16,2) NOT NULL DEFAULT 0,
    fecha_inicio DATE NULL,
    fecha_fin_estimada DATE NULL,
    avance_porcentaje DECIMAL(5,2) NOT NULL DEFAULT 0,
    estado ENUM('cotizacion','en_ejecucion','suspendido','finalizado','cancelado') NOT NULL DEFAULT 'cotizacion',
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_proyectos_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_proyectos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id),
    CONSTRAINT fk_proyectos_responsable FOREIGN KEY (responsable_id) REFERENCES usuarios (id),
    CONSTRAINT chk_proyectos_avance CHECK (avance_porcentaje BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE proyecto_avances (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    proyecto_id INT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    porcentaje DECIMAL(5,2) NOT NULL,
    descripcion VARCHAR(500) NOT NULL,
    registrado_por INT UNSIGNED NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_avances_proyecto FOREIGN KEY (proyecto_id) REFERENCES proyectos (id) ON DELETE CASCADE,
    CONSTRAINT fk_avances_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB;

CREATE TABLE presupuestos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    giro_id TINYINT UNSIGNED NOT NULL,
    anio SMALLINT UNSIGNED NOT NULL,
    mes TINYINT UNSIGNED NOT NULL,
    categoria VARCHAR(60) NOT NULL DEFAULT 'general',
    monto DECIMAL(14,2) NOT NULL,
    CONSTRAINT fk_presupuestos_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT uq_presupuestos UNIQUE (giro_id, anio, mes, categoria),
    CONSTRAINT chk_presupuestos_mes CHECK (mes BETWEEN 1 AND 12)
) ENGINE=InnoDB;

CREATE TABLE gastos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    giro_id TINYINT UNSIGNED NOT NULL,
    sede_id SMALLINT UNSIGNED NULL,
    categoria VARCHAR(60) NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    monto DECIMAL(14,2) NOT NULL,
    fecha DATE NOT NULL,
    documento VARCHAR(50) NULL,
    registrado_por INT UNSIGNED NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gastos_giro FOREIGN KEY (giro_id) REFERENCES giros_negocio (id),
    CONSTRAINT fk_gastos_sede FOREIGN KEY (sede_id) REFERENCES sedes (id),
    CONSTRAINT fk_gastos_usuario FOREIGN KEY (registrado_por) REFERENCES usuarios (id),
    INDEX idx_gastos_giro_fecha (giro_id, fecha)
) ENGINE=InnoDB;

CREATE TABLE api_claves (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT UNSIGNED NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    prefijo VARCHAR(12) NOT NULL,
    clave_hash CHAR(64) NOT NULL,
    permisos VARCHAR(255) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    ultimo_uso DATETIME NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_apiclaves_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
) ENGINE=InnoDB;

CREATE TABLE webhooks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT UNSIGNED NOT NULL,
    url VARCHAR(255) NOT NULL,
    evento VARCHAR(60) NOT NULL,
    secreto VARCHAR(64) NOT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_webhooks_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
) ENGINE=InnoDB;

CREATE TABLE integracion_bitacora (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT UNSIGNED NULL,
    tipo ENUM('api_entrada','webhook_salida','edi_importacion','edi_exportacion','gps') NOT NULL,
    referencia VARCHAR(100) NULL,
    estado ENUM('exitoso','fallido') NOT NULL,
    detalle TEXT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bitacora_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
) ENGINE=InnoDB;

CREATE VIEW vw_ventas_por_giro_mes AS
SELECT g.id AS giro_id, g.nombre AS giro, DATE_FORMAT(p.creado_en, '%Y-%m') AS mes,
       COUNT(*) AS pedidos, SUM(p.total) AS total
FROM pedidos p
JOIN giros_negocio g ON g.id = p.giro_id
WHERE p.estado <> 'cancelado'
GROUP BY g.id, g.nombre, DATE_FORMAT(p.creado_en, '%Y-%m');

CREATE VIEW vw_presupuesto_vs_gasto AS
SELECT pr.giro_id, g.nombre AS giro, pr.anio, pr.mes, SUM(pr.monto) AS presupuesto,
       COALESCE((SELECT SUM(ga.monto) FROM gastos ga
                 WHERE ga.giro_id = pr.giro_id AND YEAR(ga.fecha) = pr.anio AND MONTH(ga.fecha) = pr.mes), 0) AS gastado
FROM presupuestos pr
JOIN giros_negocio g ON g.id = pr.giro_id
GROUP BY pr.giro_id, g.nombre, pr.anio, pr.mes;
