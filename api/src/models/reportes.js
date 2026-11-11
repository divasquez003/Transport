import { consulta, uno } from '../db.js'

// Rango de fechas inclusivo para columnas DATETIME
const rango = (r) => [`${r.desde} 00:00:00`, `${r.hasta} 23:59:59`]

// Filtro opcional por giro: devuelve el SQL y sus parámetros
const porGiro = (columna, giroId) => (giroId ? [`AND ${columna} = ?`, [giroId]] : ['', []])

// ------------------------------------------------------------------ indicadores por giro

export async function indicadoresPorGiro(r, giroId = null) {
  const [gP, pP] = porGiro('p.giro_id', giroId)
  const [gM, pM] = porGiro('m.giro_id', giroId)
  const [gV, pV] = porGiro('vj.giro_id', giroId)
  const [gI, pI] = porGiro('pi.giro_proveedor_id', giroId)
  const [gG, pG] = porGiro('ga.giro_id', giroId)
  const [gR, pR] = porGiro('pr.giro_id', giroId)
  const [gS, pS] = porGiro('s.giro_id', giroId)
  const [gY, pY] = porGiro('py.giro_id', giroId)

  const [pedidos, alquileres, viajes, internos, gastos, presupuestos, pendientes, bajoMinimo, proyectos, obras] = await Promise.all([
    consulta(
      `SELECT p.giro_id, COUNT(*) AS pedidos, COALESCE(SUM(p.total), 0) AS ventas FROM pedidos p
       WHERE p.estado <> 'cancelado' AND p.creado_en BETWEEN ? AND ? ${gP} GROUP BY p.giro_id`, [...rango(r), ...pP]),
    consulta(
      `SELECT m.giro_id, COUNT(*) AS alquileres, COALESCE(SUM(a.total), 0) AS ingresos FROM alquileres a JOIN maquinas m ON m.id = a.maquina_id
       WHERE a.estado <> 'cancelado' AND a.creado_en BETWEEN ? AND ? ${gM} GROUP BY m.giro_id`, [...rango(r), ...pM]),
    consulta(
      `SELECT vj.giro_id, COUNT(*) AS viajes, SUM(vj.estado = 'entregado') AS entregados,
              COALESCE(SUM(CASE WHEN vj.cliente_id IS NOT NULL THEN vj.tarifa END), 0) AS ingresos,
              COALESCE(SUM(CASE WHEN vj.cliente_id IS NULL THEN vj.tarifa END), 0) AS ingresos_internos
       FROM viajes vj WHERE vj.estado <> 'cancelado' AND COALESCE(vj.salida_real, vj.salida_programada) BETWEEN ? AND ? ${gV}
       GROUP BY vj.giro_id`, [...rango(r), ...pV]),
    consulta(
      `SELECT pi.giro_proveedor_id AS giro_id, COUNT(*) AS pedidos_internos, COALESCE(SUM(pi.total), 0) AS ventas_internas
       FROM pedidos_internos pi WHERE pi.estado IN ('aprobado', 'en_transito', 'recibido') AND pi.creado_en BETWEEN ? AND ? ${gI}
       GROUP BY pi.giro_proveedor_id`, [...rango(r), ...pI]),
    consulta(
      `SELECT ga.giro_id, COALESCE(SUM(ga.monto), 0) AS gastos FROM gastos ga WHERE ga.fecha BETWEEN ? AND ? ${gG} GROUP BY ga.giro_id`,
      [r.desde, r.hasta, ...pG]),
    // Presupuesto de los meses del periodo. Un mes cubierto en parte cuenta en proporción a sus días,
    // salvo el mes en curso tomado desde su inicio: se compara lo gastado a la fecha con el presupuesto del mes
    consulta(
      `SELECT pr.giro_id, ROUND(COALESCE(SUM(pr.monto * CASE
                WHEN pr.inicio = DATE_FORMAT(CURDATE(), '%Y-%m-01') AND ? <= pr.inicio THEN 1
                ELSE GREATEST(0, DATEDIFF(LEAST(LAST_DAY(pr.inicio), ?), GREATEST(pr.inicio, ?)) + 1) / DAY(LAST_DAY(pr.inicio)) END), 0), 2) AS presupuesto
       FROM (SELECT giro_id, monto, categoria, STR_TO_DATE(CONCAT(anio, '-', mes, '-01'), '%Y-%c-%d') AS inicio FROM presupuestos) pr
       WHERE pr.categoria = 'general' AND pr.inicio <= ? AND LAST_DAY(pr.inicio) >= ? ${gR}
       GROUP BY pr.giro_id`, [r.desde, r.hasta, r.desde, r.hasta, r.desde, ...pR]),
    consulta(
      `SELECT p.giro_id, COUNT(*) AS pedidos_abiertos FROM pedidos p
       WHERE p.estado IN ('pendiente', 'confirmado', 'en_proceso', 'despachado') ${gP} GROUP BY p.giro_id`, pP),
    consulta(
      `SELECT s.giro_id, COUNT(*) AS productos_bajo_minimo FROM existencias e JOIN sedes s ON s.id = e.sede_id
       WHERE e.cantidad < e.minimo ${gS} GROUP BY s.giro_id`, pS),
    consulta(
      `SELECT py.giro_id, COUNT(*) AS proyectos_en_ejecucion, COALESCE(SUM(py.monto_contrato), 0) AS cartera_proyectos
       FROM proyectos py WHERE py.estado = 'en_ejecucion' ${gY} GROUP BY py.giro_id`, pY),
    // Construcción factura por avance de obra: monto del contrato x puntos de avance registrados en el periodo
    consulta(
      `SELECT py.giro_id, COUNT(*) AS avances,
              COALESCE(SUM(py.monto_contrato * (a.porcentaje - COALESCE((
                SELECT MAX(a2.porcentaje) FROM proyecto_avances a2
                WHERE a2.proyecto_id = a.proyecto_id AND (a2.fecha < a.fecha OR (a2.fecha = a.fecha AND a2.id < a.id))), 0)) / 100), 0) AS ingresos
       FROM proyecto_avances a JOIN proyectos py ON py.id = a.proyecto_id
       WHERE a.fecha BETWEEN ? AND ? ${gY} GROUP BY py.giro_id`, [r.desde, r.hasta, ...pY])
  ])
  return { pedidos, alquileres, viajes, internos, gastos, presupuestos, pendientes, bajoMinimo, proyectos, obras }
}

// Ventas mensuales de los últimos meses (vista vw_ventas_por_giro_mes)
export function ventasPorMes(meses, giroId = null) {
  const [g, p] = porGiro('giro_id', giroId)
  return consulta(
    `SELECT giro_id, giro, mes, pedidos, total FROM vw_ventas_por_giro_mes
     WHERE mes >= DATE_FORMAT(CURDATE() - INTERVAL ? MONTH, '%Y-%m') ${g} ORDER BY mes, giro_id`,
    [meses - 1, ...p]
  )
}

// ------------------------------------------------------------------ ventas agrupadas

const AGRUPACIONES = {
  dia: { campo: "DATE_FORMAT(p.creado_en, '%Y-%m-%d')", etiqueta: "DATE_FORMAT(p.creado_en, '%Y-%m-%d')" },
  mes: { campo: "DATE_FORMAT(p.creado_en, '%Y-%m')", etiqueta: "DATE_FORMAT(p.creado_en, '%Y-%m')" },
  giro: { campo: 'p.giro_id', etiqueta: 'g.nombre' },
  cliente: { campo: 'p.cliente_id', etiqueta: 'c.nombre' },
  vendedor: { campo: 'p.vendedor_id', etiqueta: "COALESCE(v.nombre, 'Sin vendedor (en línea)')" }
}
export const AGRUPAR = [...Object.keys(AGRUPACIONES), 'producto'].join(',')

export function ventas(r, giroId, agrupar) {
  const [g, pg] = porGiro('p.giro_id', giroId)
  if (agrupar === 'producto') {
    return consulta(
      `SELECT pr.id AS clave, pr.nombre AS etiqueta, pr.unidad_medida, g.nombre AS giro, SUM(d.cantidad) AS cantidad,
              COUNT(DISTINCT p.id) AS pedidos, SUM(d.subtotal) AS total
       FROM pedido_detalle d JOIN pedidos p ON p.id = d.pedido_id JOIN productos pr ON pr.id = d.producto_id
       JOIN giros_negocio g ON g.id = p.giro_id
       WHERE p.estado <> 'cancelado' AND p.creado_en BETWEEN ? AND ? ${g}
       GROUP BY pr.id, pr.nombre, pr.unidad_medida, g.nombre ORDER BY total DESC`,
      [...rango(r), ...pg]
    )
  }
  const { campo, etiqueta } = AGRUPACIONES[agrupar]
  return consulta(
    `SELECT ${campo} AS clave, ${etiqueta} AS etiqueta, COUNT(*) AS pedidos, SUM(p.total) AS total, ROUND(AVG(p.total), 2) AS promedio
     FROM pedidos p JOIN giros_negocio g ON g.id = p.giro_id JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN usuarios v ON v.id = p.vendedor_id
     WHERE p.estado <> 'cancelado' AND p.creado_en BETWEEN ? AND ? ${g}
     GROUP BY ${campo}, ${etiqueta} ORDER BY ${['dia', 'mes'].includes(agrupar) ? 'clave' : 'total DESC'}`,
    [...rango(r), ...pg]
  )
}

// ------------------------------------------------------------------ presupuesto anual

export function presupuestoAnual(anio, giroId) {
  const [g, p] = porGiro('giro_id', giroId)
  return consulta(
    `SELECT giro_id, giro, mes, presupuesto, gastado, presupuesto - gastado AS disponible,
            ROUND(gastado / presupuesto * 100, 1) AS porcentaje
     FROM vw_presupuesto_vs_gasto WHERE anio = ? ${g} ORDER BY giro_id, mes`,
    [anio, ...p]
  )
}

export function gastosPorCategoria(r, giroId) {
  const [g, p] = porGiro('ga.giro_id', giroId)
  return consulta(
    `SELECT ga.giro_id, gn.nombre AS giro, ga.categoria, COUNT(*) AS registros, SUM(ga.monto) AS total
     FROM gastos ga JOIN giros_negocio gn ON gn.id = ga.giro_id
     WHERE ga.fecha BETWEEN ? AND ? ${g} GROUP BY ga.giro_id, gn.nombre, ga.categoria ORDER BY ga.giro_id, total DESC`,
    [r.desde, r.hasta, ...p]
  )
}

// ------------------------------------------------------------------ detalle por giro

export function topClientes(r, giroId, limite = 5) {
  return consulta(
    `SELECT c.id, c.nombre, COUNT(*) AS pedidos, SUM(p.total) AS total FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
     WHERE p.estado <> 'cancelado' AND p.creado_en BETWEEN ? AND ? AND p.giro_id = ?
     GROUP BY c.id, c.nombre ORDER BY total DESC LIMIT ?`,
    [...rango(r), giroId, limite]
  )
}

export function inventarioDeGiro(giroId) {
  return consulta(
    `SELECT s.id AS sede_id, s.nombre AS sede, COUNT(*) AS productos, SUM(e.cantidad < e.minimo) AS bajo_minimo
     FROM existencias e JOIN sedes s ON s.id = e.sede_id WHERE s.giro_id = ? GROUP BY s.id, s.nombre ORDER BY s.id`,
    [giroId]
  )
}

export function extraccion(r, giroId) {
  return consulta(
    `SELECT s.nombre AS sede, p.nombre AS producto, p.unidad_medida, SUM(x.cantidad) AS total, COUNT(*) AS turnos
     FROM registros_extraccion x JOIN sedes s ON s.id = x.sede_id JOIN productos p ON p.id = x.producto_id
     WHERE s.giro_id = ? AND x.fecha BETWEEN ? AND ? GROUP BY s.nombre, p.nombre, p.unidad_medida ORDER BY s.nombre, total DESC`,
    [giroId, r.desde, r.hasta]
  )
}

export function ordenesProduccion(giroId) {
  return consulta(
    `SELECT o.estado, COUNT(*) AS ordenes, SUM(o.cantidad_planificada) AS planificado, SUM(o.cantidad_producida) AS producido
     FROM ordenes_produccion o JOIN sedes s ON s.id = o.sede_id WHERE s.giro_id = ? GROUP BY o.estado`,
    [giroId]
  )
}

// Días alquilados de cada máquina dentro del periodo (utilización)
export function utilizacionMaquinas(r, giroId) {
  return consulta(
    `SELECT m.id, m.codigo, m.tipo, m.estado,
            COALESCE(SUM(GREATEST(0, DATEDIFF(LEAST(COALESCE(a.fecha_devolucion, a.fecha_fin), ?), GREATEST(a.fecha_inicio, ?)) + 1)), 0) AS dias_alquilada,
            COALESCE(SUM(a.total), 0) AS ingresos
     FROM maquinas m
     LEFT JOIN alquileres a ON a.maquina_id = m.id AND a.estado IN ('activo', 'finalizado')
       AND a.fecha_inicio <= ? AND COALESCE(a.fecha_devolucion, a.fecha_fin) >= ?
     WHERE m.giro_id = ? AND m.estado <> 'vendida'
     GROUP BY m.id, m.codigo, m.tipo, m.estado ORDER BY dias_alquilada DESC`,
    [r.hasta, r.desde, r.hasta, r.desde, giroId]
  )
}

export function viajesPorRuta(r, giroId) {
  return consulta(
    `SELECT vj.tipo_ruta, COUNT(*) AS viajes, SUM(vj.estado = 'entregado') AS entregados, COALESCE(SUM(vj.tarifa), 0) AS ingresos,
            ROUND(AVG(TIMESTAMPDIFF(MINUTE, vj.salida_real, vj.llegada_real)), 0) AS minutos_promedio
     FROM viajes vj WHERE vj.giro_id = ? AND vj.estado <> 'cancelado'
       AND COALESCE(vj.salida_real, vj.salida_programada) BETWEEN ? AND ?
     GROUP BY vj.tipo_ruta ORDER BY viajes DESC`,
    [giroId, ...rango(r)]
  )
}

export function proyectosDeGiro(giroId) {
  return consulta(
    `SELECT py.id, py.codigo, py.nombre, py.tipo, c.nombre AS cliente, py.monto_contrato, py.fecha_inicio, py.fecha_fin_estimada,
            py.avance_porcentaje, py.estado
     FROM proyectos py JOIN clientes c ON c.id = py.cliente_id WHERE py.giro_id = ? AND py.estado <> 'cancelado' ORDER BY py.estado, py.id`,
    [giroId]
  )
}

// ------------------------------------------------------------------ cliente

export async function resumenCliente(clienteId, r, giroId) {
  const [g, p] = porGiro('p.giro_id', giroId)
  const [gM, pM] = porGiro('m.giro_id', giroId)
  const [gV, pV] = porGiro('vj.giro_id', giroId)
  const [gY, pY] = porGiro('py.giro_id', giroId)
  const [porGiroNegocio, porMes, ultimos, alquileres, viajes, proyectos] = await Promise.all([
    consulta(
      `SELECT g.id AS giro_id, g.nombre AS giro, COUNT(*) AS pedidos, SUM(p.total) AS total
       FROM pedidos p JOIN giros_negocio g ON g.id = p.giro_id
       WHERE p.cliente_id = ? AND p.estado <> 'cancelado' AND p.creado_en BETWEEN ? AND ? ${g}
       GROUP BY g.id, g.nombre ORDER BY total DESC`, [clienteId, ...rango(r), ...p]),
    consulta(
      `SELECT DATE_FORMAT(p.creado_en, '%Y-%m') AS mes, COUNT(*) AS pedidos, SUM(p.total) AS total FROM pedidos p
       WHERE p.cliente_id = ? AND p.estado <> 'cancelado' AND p.creado_en BETWEEN ? AND ? ${g} GROUP BY mes ORDER BY mes`,
      [clienteId, ...rango(r), ...p]),
    consulta(
      `SELECT p.id, p.codigo, g.nombre AS giro, p.estado, p.total, p.creado_en FROM pedidos p JOIN giros_negocio g ON g.id = p.giro_id
       WHERE p.cliente_id = ? ${g} ORDER BY p.creado_en DESC LIMIT 5`, [clienteId, ...p]),
    uno(
      `SELECT COUNT(*) AS alquileres, COALESCE(SUM(a.total), 0) AS total FROM alquileres a JOIN maquinas m ON m.id = a.maquina_id
       WHERE a.cliente_id = ? AND a.estado <> 'cancelado' AND a.creado_en BETWEEN ? AND ? ${gM}`, [clienteId, ...rango(r), ...pM]),
    uno(
      `SELECT COUNT(*) AS viajes, COALESCE(SUM(vj.tarifa), 0) AS total FROM viajes vj
       WHERE vj.cliente_id = ? AND vj.estado <> 'cancelado' AND COALESCE(vj.salida_real, vj.salida_programada) BETWEEN ? AND ? ${gV}`,
      [clienteId, ...rango(r), ...pV]),
    consulta(
      `SELECT py.id, py.codigo, py.nombre, py.estado, py.avance_porcentaje, py.monto_contrato FROM proyectos py
       WHERE py.cliente_id = ? ${gY} ORDER BY py.id DESC`, [clienteId, ...pY])
  ])
  return { porGiroNegocio, porMes, ultimos, alquileres, viajes, proyectos }
}
