import { actualizarCampos, consulta, donde, insertar, paginar, uno, valor } from '../db.js'
import { codigo } from '../lib/formato.js'

export const ESTADOS_VEHICULO = 'disponible,en_ruta,mantenimiento,inactivo'
export const ESTADOS_VIAJE = 'programado,en_ruta,entregado,cancelado'
export const TIPOS_RUTA = 'materia_prima,inter_puertos,inter_fronteras,puerto_bodega,bodega_puerto,local'
export const EDITABLES_VEHICULO = ['sede_id', 'gps_dispositivo_id', 'placa', 'tipo', 'capacidad_ton', 'velocidad_maxima_kmh', 'estado']

const POSICION = `LEFT JOIN gps_eventos e ON e.id = (
    SELECT e2.id FROM gps_eventos e2 WHERE e2.dispositivo_id = v.gps_dispositivo_id ORDER BY e2.registrado_en DESC, e2.id DESC LIMIT 1)`

const COLUMNAS_VEHICULO = `v.id, v.giro_id, g.nombre AS giro, v.sede_id, s.nombre AS sede, v.gps_dispositivo_id, d.codigo_externo AS gps,
  v.placa, v.tipo, v.capacidad_ton, v.velocidad_maxima_kmh, v.estado,
  e.latitud, e.longitud, e.velocidad_kmh, e.registrado_en AS posicion_en`

const ORIGEN_VEHICULO = `FROM vehiculos v
  JOIN giros_negocio g ON g.id = v.giro_id
  LEFT JOIN sedes s ON s.id = v.sede_id
  LEFT JOIN gps_dispositivos d ON d.id = v.gps_dispositivo_id
  ${POSICION}`

export function listarVehiculos(f) {
  const filtro = donde([['v.giro_id = ?', f.giro_id], ['v.estado = ?', f.estado]])
  return consulta(`SELECT ${COLUMNAS_VEHICULO} ${ORIGEN_VEHICULO} ${filtro.sql} ORDER BY v.giro_id, v.placa`, filtro.parametros)
}

export const buscarVehiculo = (id) => uno(`SELECT ${COLUMNAS_VEHICULO} ${ORIGEN_VEHICULO} WHERE v.id = ?`, [id])
export const actualizarVehiculo = (id, d) => actualizarCampos('vehiculos', id, d, EDITABLES_VEHICULO)

export async function existePlaca(placa, exceptoId = 0) {
  return Number(await valor('SELECT COUNT(*) FROM vehiculos WHERE placa = ? AND id <> ?', [placa, exceptoId])) > 0
}

export function crearVehiculo(d) {
  return insertar(
    `INSERT INTO vehiculos (giro_id, sede_id, gps_dispositivo_id, placa, tipo, capacidad_ton, velocidad_maxima_kmh)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [d.giro_id, d.sede_id ?? null, d.gps_dispositivo_id ?? null, d.placa, d.tipo, d.capacidad_ton ?? null, d.velocidad_maxima_kmh ?? 80]
  )
}

const COLUMNAS_VIAJE = `vj.id, vj.codigo, vj.estado, vj.giro_id, g.nombre AS giro, vj.vehiculo_id, ve.placa, ve.tipo AS tipo_vehiculo,
  ve.gps_dispositivo_id, vj.piloto_id, pi.nombre AS piloto, pi.telefono AS piloto_telefono, vj.cliente_id, c.nombre AS cliente,
  vj.pedido_id, pe.codigo AS pedido, pe.giro_id AS pedido_giro_id, vj.pedido_interno_id, pin.codigo AS pedido_interno,
  pin.giro_solicitante_id AS pedido_interno_solicitante_id, pin.giro_proveedor_id AS pedido_interno_proveedor_id,
  vj.tipo_ruta, vj.origen, vj.destino,
  vj.carga_descripcion, vj.peso_ton, vj.salida_programada, vj.salida_real, vj.llegada_real, vj.tarifa, vj.creado_en`

const ORIGEN_VIAJE = `FROM viajes vj
  JOIN giros_negocio g ON g.id = vj.giro_id
  JOIN vehiculos ve ON ve.id = vj.vehiculo_id
  LEFT JOIN usuarios pi ON pi.id = vj.piloto_id
  LEFT JOIN clientes c ON c.id = vj.cliente_id
  LEFT JOIN pedidos pe ON pe.id = vj.pedido_id
  LEFT JOIN pedidos_internos pin ON pin.id = vj.pedido_interno_id`

export async function crearViaje(d) {
  const viajeId = await insertar(
    `INSERT INTO viajes (giro_id, vehiculo_id, piloto_id, cliente_id, pedido_id, pedido_interno_id, tipo_ruta, origen, destino,
       carga_descripcion, peso_ton, salida_programada, tarifa)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.giro_id, d.vehiculo_id, d.piloto_id ?? null, d.cliente_id ?? null, d.pedido_id ?? null, d.pedido_interno_id ?? null, d.tipo_ruta,
      d.origen, d.destino, d.carga_descripcion ?? null, d.peso_ton ?? null, d.salida_programada, d.tarifa ?? null]
  )
  await consulta('UPDATE viajes SET codigo = ? WHERE id = ?', [codigo('VIA', viajeId), viajeId])
  return viajeId
}

export function listarViajes(f, pag) {
  // giro_id: viajes del giro de transporte o de los pedidos (normales o internos) de ese giro
  const filtro = donde([
    ['(vj.giro_id = ? OR pe.giro_id = ? OR pin.giro_solicitante_id = ? OR pin.giro_proveedor_id = ?)', ...Array(4).fill(f.giro_id)],
    ['vj.cliente_id = ?', f.cliente_id],
    ['vj.pedido_id = ?', f.pedido_id],
    ['vj.pedido_interno_id = ?', f.pedido_interno_id],
    ['vj.piloto_id = ?', f.piloto_id],
    ['vj.vehiculo_id = ?', f.vehiculo_id],
    ['vj.estado = ?', f.estado],
    ['COALESCE(vj.salida_real, vj.salida_programada) >= ?', f.desde && `${f.desde} 00:00:00`]
  ])
  return paginar({
    seleccion: COLUMNAS_VIAJE,
    origen: ORIGEN_VIAJE,
    filtro,
    orden: "FIELD(vj.estado, 'en_ruta', 'programado') = 0, FIELD(vj.estado, 'en_ruta', 'programado'), vj.salida_programada DESC",
    pag
  })
}

export const buscarViaje = (id) => uno(`SELECT ${COLUMNAS_VIAJE} ${ORIGEN_VIAJE} WHERE vj.id = ?`, [id])
export const actualizarViaje = (id, d) => actualizarCampos('viajes', id, d, ['estado', 'salida_real', 'llegada_real'])

export function viajeEnRutaDe(vehiculoId) {
  return uno("SELECT id, codigo, piloto_id, cliente_id FROM viajes WHERE vehiculo_id = ? AND estado = 'en_ruta' ORDER BY id DESC LIMIT 1", [vehiculoId])
}
