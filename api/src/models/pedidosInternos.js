import { consulta, donde, insertar, paginar, uno } from '../db.js'
import { codigo } from '../lib/formato.js'

export const ESTADOS = 'solicitado,aprobado,en_transito,recibido,rechazado,cancelado'
export const PRIORIDADES = 'baja,media,alta,urgente'

const COLUMNAS = `pi.id, pi.codigo, pi.estado, pi.prioridad, pi.fecha_requerida, pi.total,
  pi.giro_solicitante_id, gs.nombre AS giro_solicitante, pi.sede_solicitante_id, ss.nombre AS sede_solicitante,
  pi.giro_proveedor_id, gp.nombre AS giro_proveedor, pi.sede_proveedora_id, sp.nombre AS sede_proveedora,
  pi.solicitado_por, us.nombre AS solicitado_por_nombre, pi.atendido_por, ua.nombre AS atendido_por_nombre,
  pi.observaciones, pi.creado_en, pi.actualizado_en`

const ORIGEN = `FROM pedidos_internos pi
  JOIN giros_negocio gs ON gs.id = pi.giro_solicitante_id
  JOIN sedes ss ON ss.id = pi.sede_solicitante_id
  JOIN giros_negocio gp ON gp.id = pi.giro_proveedor_id
  LEFT JOIN sedes sp ON sp.id = pi.sede_proveedora_id
  JOIN usuarios us ON us.id = pi.solicitado_por
  LEFT JOIN usuarios ua ON ua.id = pi.atendido_por`

export async function crear(d, detalle) {
  const pedidoId = await insertar(
    `INSERT INTO pedidos_internos (giro_solicitante_id, sede_solicitante_id, giro_proveedor_id, sede_proveedora_id,
       solicitado_por, prioridad, fecha_requerida, total, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.giro_solicitante_id, d.sede_solicitante_id, d.giro_proveedor_id, d.sede_proveedora_id ?? null, d.solicitado_por, d.prioridad, d.fecha_requerida, d.total, d.observaciones ?? null]
  )
  await consulta('UPDATE pedidos_internos SET codigo = ? WHERE id = ?', [codigo('PI', pedidoId), pedidoId])
  await consulta(
    'INSERT INTO pedido_interno_detalle (pedido_interno_id, producto_id, cantidad, costo_unitario, subtotal) VALUES ?',
    [detalle.map((l) => [pedidoId, l.producto_id, l.cantidad, l.costo_unitario, l.subtotal])]
  )
  return pedidoId
}

export function registrarHistorial(pedidoId, anterior, nuevo, usuarioId, comentario) {
  return consulta(
    'INSERT INTO pedido_interno_historial (pedido_interno_id, estado_anterior, estado_nuevo, usuario_id, comentario) VALUES (?, ?, ?, ?, ?)',
    [pedidoId, anterior, nuevo, usuarioId, comentario ?? null]
  )
}

// giro: si viene, solo los pedidos donde ese giro es solicitante o proveedor (?rol= para uno de los dos)
export function listar(f, giro, pag) {
  let condicionGiro = [undefined]
  if (giro) {
    if (f.rol === 'solicitante') condicionGiro = ['pi.giro_solicitante_id = ?', giro]
    else if (f.rol === 'proveedor') condicionGiro = ['pi.giro_proveedor_id = ?', giro]
    else condicionGiro = ['(pi.giro_solicitante_id = ? OR pi.giro_proveedor_id = ?)', giro, giro]
  }
  const filtro = donde([condicionGiro, ['pi.estado = ?', f.estado], ['pi.prioridad = ?', f.prioridad]])
  return paginar({
    seleccion: `${COLUMNAS}, (SELECT COUNT(*) FROM pedido_interno_detalle d WHERE d.pedido_interno_id = pi.id) AS total_productos`,
    origen: ORIGEN,
    filtro,
    orden: "FIELD(pi.estado, 'solicitado', 'aprobado', 'en_transito') = 0, FIELD(pi.prioridad, 'urgente', 'alta', 'media', 'baja'), pi.fecha_requerida, pi.id DESC",
    pag
  })
}

export async function buscar(pedidoId) {
  const pedido = await uno(`SELECT ${COLUMNAS} ${ORIGEN} WHERE pi.id = ?`, [pedidoId])
  if (!pedido) return null
  pedido.detalle = await consulta(
    `SELECT d.producto_id, pr.codigo, pr.nombre AS producto, pr.tipo, pr.unidad_medida, d.cantidad, d.costo_unitario, d.subtotal
     FROM pedido_interno_detalle d JOIN productos pr ON pr.id = d.producto_id WHERE d.pedido_interno_id = ? ORDER BY d.id`,
    [pedidoId]
  )
  pedido.historial = await consulta(
    `SELECT h.estado_anterior, h.estado_nuevo, h.comentario, u.nombre AS usuario, h.creado_en
     FROM pedido_interno_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE h.pedido_interno_id = ? ORDER BY h.id`,
    [pedidoId]
  )
  return pedido
}

export function cambiarEstado(pedidoId, estado, { atendidoPor = null, sedeProveedora = null } = {}) {
  return consulta(
    `UPDATE pedidos_internos SET estado = ?, atendido_por = COALESCE(?, atendido_por),
       sede_proveedora_id = COALESCE(?, sede_proveedora_id) WHERE id = ?`,
    [estado, atendidoPor, sedeProveedora, pedidoId]
  )
}
