import { actualizarCampos, consulta, donde, insertar, paginar, uno, valor } from '../db.js'
import { codigo } from '../lib/formato.js'

export const ESTADOS_MAQUINA = 'disponible,alquilada,en_uso,mantenimiento,vendida'
export const ESTADOS_ALQUILER = 'reservado,activo,finalizado,cancelado'
export const EDITABLES_MAQUINA = ['sede_id', 'producto_id', 'gps_dispositivo_id', 'codigo', 'tipo', 'marca', 'modelo', 'anio', 'estado', 'tarifa_diaria', 'precio_venta', 'horometro']

const COLUMNAS_MAQUINA = `m.id, m.giro_id, m.sede_id, s.nombre AS sede, s.departamento, m.producto_id, p.nombre AS servicio,
  m.codigo, m.tipo, m.marca, m.modelo, m.anio, m.estado, m.tarifa_diaria, m.precio_venta, m.horometro, m.gps_dispositivo_id`

const ORIGEN_MAQUINA = `FROM maquinas m
  LEFT JOIN sedes s ON s.id = m.sede_id
  LEFT JOIN productos p ON p.id = m.producto_id`

export function listarMaquinas(f) {
  const filtro = donde([
    ['m.giro_id = ?', f.giro_id],
    ['m.sede_id = ?', f.sede_id],
    ['m.estado = ?', f.estado],
    ['m.producto_id = ?', f.producto_id],
    ['m.tipo LIKE ?', f.tipo && `%${f.tipo}%`],
    f.publico ? ["m.estado <> 'vendida'"] : ['1 = 1']
  ])
  return consulta(`SELECT ${COLUMNAS_MAQUINA} ${ORIGEN_MAQUINA} ${filtro.sql} ORDER BY m.tipo, m.codigo`, filtro.parametros)
}

export const buscarMaquina = (id) => uno(`SELECT ${COLUMNAS_MAQUINA} ${ORIGEN_MAQUINA} WHERE m.id = ?`, [id])
export const maquinaBloqueada = (id) => uno('SELECT id, giro_id, estado, tarifa_diaria, codigo, tipo FROM maquinas WHERE id = ? FOR UPDATE', [id])
export const actualizarMaquina = (id, d) => actualizarCampos('maquinas', id, d, EDITABLES_MAQUINA)

export async function existeCodigoMaquina(codigo, exceptoId = 0) {
  return Number(await valor('SELECT COUNT(*) FROM maquinas WHERE codigo = ? AND id <> ?', [codigo, exceptoId])) > 0
}

export const alquilerActivo = (maquinaId) => uno(
  `SELECT ${COLUMNAS_ALQUILER} ${ORIGEN_ALQUILER} WHERE a.maquina_id = ? AND a.estado = 'activo' ORDER BY a.id DESC LIMIT 1`, [maquinaId]
)

export function crearMaquina(d) {
  return insertar(
    `INSERT INTO maquinas (giro_id, sede_id, producto_id, gps_dispositivo_id, codigo, tipo, marca, modelo, anio, estado, tarifa_diaria, precio_venta, horometro)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.giro_id, d.sede_id ?? null, d.producto_id ?? null, d.gps_dispositivo_id ?? null, d.codigo, d.tipo, d.marca ?? null, d.modelo ?? null,
      d.anio ?? null, d.estado ?? 'disponible', d.tarifa_diaria ?? null, d.precio_venta ?? null, d.horometro ?? null]
  )
}

// Reservas y alquileres que ocupan la máquina en el rango de fechas
export function ocupacion(maquinaId, desde, hasta, exceptoId = 0) {
  return consulta(
    `SELECT id, codigo, fecha_inicio, fecha_fin, estado FROM alquileres
     WHERE maquina_id = ? AND estado IN ('reservado', 'activo') AND fecha_inicio <= ? AND fecha_fin >= ? AND id <> ?
     ORDER BY fecha_inicio`,
    [maquinaId, hasta, desde, exceptoId]
  )
}

const COLUMNAS_ALQUILER = `a.id, a.codigo, a.estado, a.maquina_id, m.codigo AS maquina, m.tipo AS tipo_maquina, m.giro_id,
  a.cliente_id, c.nombre AS cliente, a.vendedor_id, v.nombre AS vendedor, a.fecha_inicio, a.fecha_fin, a.fecha_devolucion,
  DATEDIFF(a.fecha_fin, a.fecha_inicio) + 1 AS dias, a.tarifa_diaria, a.total, a.creado_en`

const ORIGEN_ALQUILER = `FROM alquileres a
  JOIN maquinas m ON m.id = a.maquina_id
  JOIN clientes c ON c.id = a.cliente_id
  LEFT JOIN usuarios v ON v.id = a.vendedor_id`

export async function crearAlquiler(d) {
  const alquilerId = await insertar(
    `INSERT INTO alquileres (maquina_id, cliente_id, vendedor_id, fecha_inicio, fecha_fin, tarifa_diaria, total)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [d.maquina_id, d.cliente_id, d.vendedor_id ?? null, d.fecha_inicio, d.fecha_fin, d.tarifa_diaria, d.total]
  )
  await consulta('UPDATE alquileres SET codigo = ? WHERE id = ?', [codigo('ALQ', alquilerId), alquilerId])
  return alquilerId
}

export function listarAlquileres(f, pag) {
  const filtro = donde([
    ['a.cliente_id = ?', f.cliente_id],
    ['m.giro_id = ?', f.giro_id],
    ['a.maquina_id = ?', f.maquina_id],
    ['a.estado = ?', f.estado]
  ])
  return paginar({
    seleccion: COLUMNAS_ALQUILER,
    origen: ORIGEN_ALQUILER,
    filtro,
    orden: "FIELD(a.estado, 'activo', 'reservado') = 0, a.fecha_inicio DESC, a.id DESC",
    pag
  })
}

export const buscarAlquiler = (id) => uno(`SELECT ${COLUMNAS_ALQUILER} ${ORIGEN_ALQUILER} WHERE a.id = ?`, [id])

export function actualizarAlquiler(id, d) {
  return actualizarCampos('alquileres', id, d, ['estado', 'fecha_devolucion', 'total'])
}
