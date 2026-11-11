import { actualizarCampos, consulta, donde, insertar, paginar, uno, valor } from '../db.js'
import { codigo } from '../lib/formato.js'

// ------------------------------------------------------------------ extracción minera

export function crearExtraccion(d) {
  return insertar(
    'INSERT INTO registros_extraccion (sede_id, producto_id, fecha, turno, cantidad, registrado_por, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [d.sede_id, d.producto_id, d.fecha, d.turno, d.cantidad, d.registrado_por, d.observaciones ?? null]
  )
}

function filtroExtraccion(f) {
  return donde([
    ['r.sede_id = ?', f.sede_id],
    ['s.giro_id = ?', f.giro_id],
    ['r.producto_id = ?', f.producto_id],
    ['r.fecha >= ?', f.desde],
    ['r.fecha <= ?', f.hasta]
  ])
}

const ORIGEN_EXTRACCION = `FROM registros_extraccion r
  JOIN sedes s ON s.id = r.sede_id
  JOIN productos p ON p.id = r.producto_id
  LEFT JOIN usuarios u ON u.id = r.registrado_por`

export function listarExtraccion(f, pag) {
  return paginar({
    seleccion: `r.id, r.sede_id, s.nombre AS sede, r.producto_id, p.nombre AS producto, p.unidad_medida, r.fecha, r.turno,
      r.cantidad, r.observaciones, u.nombre AS registrado_por, r.creado_en`,
    origen: ORIGEN_EXTRACCION,
    filtro: filtroExtraccion(f),
    orden: 'r.fecha DESC, r.id DESC',
    pag
  })
}

export function resumenExtraccion(f) {
  const filtro = filtroExtraccion(f)
  return consulta(
    `SELECT r.producto_id, p.nombre AS producto, p.unidad_medida, SUM(r.cantidad) AS total, COUNT(*) AS registros
     ${ORIGEN_EXTRACCION} ${filtro.sql} GROUP BY r.producto_id, p.nombre, p.unidad_medida ORDER BY total DESC`,
    filtro.parametros
  )
}

// ------------------------------------------------------------------ órdenes de producción (plantas de proceso)

export const ESTADOS_ORDEN = 'planificada,en_proceso,finalizada,cancelada'

const COLUMNAS_ORDEN = `o.id, o.codigo, o.sede_id, s.nombre AS sede, s.giro_id, o.producto_id, p.nombre AS producto, p.unidad_medida,
  o.cantidad_planificada, o.cantidad_producida, ROUND(o.cantidad_producida / o.cantidad_planificada * 100, 1) AS avance,
  o.fecha_inicio, o.fecha_fin, o.estado, u.nombre AS creado_por, o.creado_en`

const ORIGEN_ORDEN = `FROM ordenes_produccion o
  JOIN sedes s ON s.id = o.sede_id
  JOIN productos p ON p.id = o.producto_id
  LEFT JOIN usuarios u ON u.id = o.creado_por`

export async function crearOrden(d) {
  const ordenId = await insertar(
    'INSERT INTO ordenes_produccion (sede_id, producto_id, cantidad_planificada, fecha_inicio, creado_por) VALUES (?, ?, ?, ?, ?)',
    [d.sede_id, d.producto_id, d.cantidad_planificada, d.fecha_inicio, d.creado_por]
  )
  await consulta('UPDATE ordenes_produccion SET codigo = ? WHERE id = ?', [codigo('OP', ordenId), ordenId])
  return ordenId
}

export function listarOrdenes(f, pag) {
  const filtro = donde([['o.sede_id = ?', f.sede_id], ['s.giro_id = ?', f.giro_id], ['o.estado = ?', f.estado]])
  return paginar({
    seleccion: COLUMNAS_ORDEN,
    origen: ORIGEN_ORDEN,
    filtro,
    orden: "FIELD(o.estado, 'en_proceso', 'planificada') = 0, o.fecha_inicio DESC",
    pag
  })
}

export const buscarOrden = (id) => uno(`SELECT ${COLUMNAS_ORDEN} ${ORIGEN_ORDEN} WHERE o.id = ?`, [id])
export const actualizarOrden = (id, d) => actualizarCampos('ordenes_produccion', id, d, ['estado', 'cantidad_producida', 'fecha_fin'])

// ------------------------------------------------------------------ proyectos de construcción

export const ESTADOS_PROYECTO = 'cotizacion,en_ejecucion,suspendido,finalizado,cancelado'
export const TIPOS_PROYECTO = 'puente,carretera,edificio,otro'
export const EDITABLES_PROYECTO = ['nombre', 'tipo', 'ubicacion', 'monto_contrato', 'fecha_inicio', 'fecha_fin_estimada', 'responsable_id', 'estado']

const COLUMNAS_PROYECTO = `pr.id, pr.codigo, pr.giro_id, pr.cliente_id, c.nombre AS cliente, pr.responsable_id, r.nombre AS responsable,
  pr.nombre, pr.tipo, pr.ubicacion, pr.monto_contrato, pr.fecha_inicio, pr.fecha_fin_estimada, pr.avance_porcentaje,
  pr.estado, pr.creado_en`

const ORIGEN_PROYECTO = `FROM proyectos pr
  JOIN clientes c ON c.id = pr.cliente_id
  LEFT JOIN usuarios r ON r.id = pr.responsable_id`

export async function crearProyecto(d) {
  const proyectoId = await insertar(
    `INSERT INTO proyectos (giro_id, cliente_id, responsable_id, nombre, tipo, ubicacion, monto_contrato, fecha_inicio, fecha_fin_estimada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.giro_id, d.cliente_id, d.responsable_id ?? null, d.nombre, d.tipo, d.ubicacion, d.monto_contrato ?? 0, d.fecha_inicio ?? null, d.fecha_fin_estimada ?? null]
  )
  await consulta('UPDATE proyectos SET codigo = ? WHERE id = ?', [codigo('PRY', proyectoId), proyectoId])
  return proyectoId
}

export function listarProyectos(f, pag) {
  const filtro = donde([['pr.giro_id = ?', f.giro_id], ['pr.cliente_id = ?', f.cliente_id], ['pr.estado = ?', f.estado], ['pr.tipo = ?', f.tipo]])
  return paginar({
    seleccion: COLUMNAS_PROYECTO,
    origen: ORIGEN_PROYECTO,
    filtro,
    orden: "FIELD(pr.estado, 'en_ejecucion', 'cotizacion', 'suspendido') = 0, FIELD(pr.estado, 'en_ejecucion', 'cotizacion', 'suspendido'), pr.id DESC",
    pag
  })
}

export async function buscarProyecto(id) {
  const proyecto = await uno(`SELECT ${COLUMNAS_PROYECTO} ${ORIGEN_PROYECTO} WHERE pr.id = ?`, [id])
  if (!proyecto) return null
  proyecto.avances = await consulta(
    `SELECT a.id, a.fecha, a.porcentaje, a.descripcion, u.nombre AS registrado_por, a.creado_en
     FROM proyecto_avances a LEFT JOIN usuarios u ON u.id = a.registrado_por WHERE a.proyecto_id = ? ORDER BY a.fecha, a.id`,
    [id]
  )
  return proyecto
}

export const actualizarProyecto = (id, d) => actualizarCampos('proyectos', id, d, [...EDITABLES_PROYECTO, 'avance_porcentaje'])

export function agregarAvance(d) {
  return insertar(
    'INSERT INTO proyecto_avances (proyecto_id, fecha, porcentaje, descripcion, registrado_por) VALUES (?, ?, ?, ?, ?)',
    [d.proyecto_id, d.fecha, d.porcentaje, d.descripcion, d.registrado_por]
  )
}

// ------------------------------------------------------------------ presupuesto y gastos

// Lo gastado se suma por giro, año y mes; el presupuesto "general" cubre todas las categorías
const GASTADO = `COALESCE((SELECT SUM(ga.monto) FROM gastos ga
  WHERE ga.giro_id = pr.giro_id AND YEAR(ga.fecha) = pr.anio AND MONTH(ga.fecha) = pr.mes
    AND (pr.categoria = 'general' OR ga.categoria = pr.categoria)), 0)`

export function listarPresupuestos(f) {
  const filtro = donde([['pr.giro_id = ?', f.giro_id], ['pr.anio = ?', f.anio], ['pr.mes = ?', f.mes]])
  return consulta(
    `SELECT pr.id, pr.giro_id, g.nombre AS giro, pr.anio, pr.mes, pr.categoria, pr.monto, ${GASTADO} AS gastado,
            pr.monto - ${GASTADO} AS disponible, ROUND(${GASTADO} / pr.monto * 100, 1) AS porcentaje
     FROM presupuestos pr JOIN giros_negocio g ON g.id = pr.giro_id
     ${filtro.sql} ORDER BY pr.anio DESC, pr.mes DESC, pr.giro_id, pr.categoria`,
    filtro.parametros
  )
}

export function guardarPresupuesto(d) {
  return consulta(
    `INSERT INTO presupuestos (giro_id, anio, mes, categoria, monto) VALUES (?, ?, ?, ?, ?) AS nuevo
     ON DUPLICATE KEY UPDATE monto = nuevo.monto`,
    [d.giro_id, d.anio, d.mes, d.categoria, d.monto]
  )
}

export function buscarPresupuesto(giroId, anio, mes, categoria) {
  return uno(
    `SELECT pr.id, pr.giro_id, g.nombre AS giro, pr.anio, pr.mes, pr.categoria, pr.monto, ${GASTADO} AS gastado
     FROM presupuestos pr JOIN giros_negocio g ON g.id = pr.giro_id
     WHERE pr.giro_id = ? AND pr.anio = ? AND pr.mes = ? AND pr.categoria = ?`,
    [giroId, anio, mes, categoria]
  )
}

function filtroGastos(f) {
  return donde([
    ['ga.giro_id = ?', f.giro_id],
    ['ga.sede_id = ?', f.sede_id],
    ['ga.categoria = ?', f.categoria],
    ['ga.fecha >= ?', f.desde],
    ['ga.fecha <= ?', f.hasta]
  ])
}

export async function listarGastos(f, pag) {
  const filtro = filtroGastos(f)
  const resultado = await paginar({
    seleccion: `ga.id, ga.giro_id, g.nombre AS giro, ga.sede_id, s.nombre AS sede, ga.categoria, ga.descripcion, ga.monto,
      ga.fecha, ga.documento, u.nombre AS registrado_por, ga.creado_en`,
    origen: `FROM gastos ga JOIN giros_negocio g ON g.id = ga.giro_id LEFT JOIN sedes s ON s.id = ga.sede_id
      LEFT JOIN usuarios u ON u.id = ga.registrado_por`,
    filtro,
    orden: 'ga.fecha DESC, ga.id DESC',
    pag
  })
  const suma = await valor(`SELECT COALESCE(SUM(ga.monto), 0) FROM gastos ga ${filtro.sql}`, filtro.parametros)
  return [...resultado, Number(suma)]
}

export function crearGasto(d) {
  return insertar(
    'INSERT INTO gastos (giro_id, sede_id, categoria, descripcion, monto, fecha, documento, registrado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [d.giro_id, d.sede_id ?? null, d.categoria, d.descripcion, d.monto, d.fecha, d.documento ?? null, d.registrado_por]
  )
}
