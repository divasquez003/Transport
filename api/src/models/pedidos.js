import { consulta, donde, insertar, paginar, uno } from '../db.js'
import { codigo } from '../lib/formato.js'

export const ESTADOS = 'pendiente,confirmado,en_proceso,despachado,entregado,cancelado'

const COLUMNAS = `p.id, p.codigo, p.estado, p.total, p.cliente_id, c.nombre AS cliente, p.giro_id, g.nombre AS giro,
  p.sede_id, s.nombre AS sede, p.vendedor_id, v.nombre AS vendedor, p.direccion_entrega, p.fecha_entrega,
  p.observaciones, p.creado_en, p.actualizado_en`

const ORIGEN = `FROM pedidos p
  JOIN clientes c ON c.id = p.cliente_id
  JOIN giros_negocio g ON g.id = p.giro_id
  LEFT JOIN sedes s ON s.id = p.sede_id
  LEFT JOIN usuarios v ON v.id = p.vendedor_id`

export async function crear(d, detalle) {
  const pedidoId = await insertar(
    `INSERT INTO pedidos (cliente_id, giro_id, sede_id, vendedor_id, total, direccion_entrega, fecha_entrega, observaciones, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.cliente_id, d.giro_id, d.sede_id ?? null, d.vendedor_id ?? null, d.total, d.direccion_entrega ?? null, d.fecha_entrega ?? null, d.observaciones ?? null, d.creado_por ?? null]
  )
  await consulta('UPDATE pedidos SET codigo = ? WHERE id = ?', [codigo('PED', pedidoId), pedidoId])
  await consulta(
    'INSERT INTO pedido_detalle (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES ?',
    [detalle.map((l) => [pedidoId, l.producto_id, l.cantidad, l.precio_unitario, l.subtotal])]
  )
  return pedidoId
}

export function registrarHistorial(pedidoId, anterior, nuevo, usuarioId, comentario) {
  return consulta(
    'INSERT INTO pedido_historial (pedido_id, estado_anterior, estado_nuevo, usuario_id, comentario) VALUES (?, ?, ?, ?, ?)',
    [pedidoId, anterior, nuevo, usuarioId ?? null, comentario ?? null]
  )
}

export function listar(f, pag) {
  const filtro = donde([
    ['p.cliente_id = ?', f.cliente_id],
    ['p.giro_id = ?', f.giro_id],
    ['p.vendedor_id = ?', f.vendedor_id],
    ['p.estado = ?', f.estado],
    ['p.creado_en >= ?', f.desde && `${f.desde} 00:00:00`],
    ['p.creado_en <= ?', f.hasta && `${f.hasta} 23:59:59`],
    ['(p.codigo LIKE ? OR c.nombre LIKE ?)', ...(f.buscar ? [`%${f.buscar}%`, `%${f.buscar}%`] : [undefined])]
  ])
  return paginar({
    seleccion: `${COLUMNAS}, (SELECT COUNT(*) FROM pedido_detalle d WHERE d.pedido_id = p.id) AS total_productos`,
    origen: ORIGEN,
    filtro,
    orden: 'p.creado_en DESC, p.id DESC',
    pag
  })
}

export async function buscar(pedidoId) {
  const pedido = await uno(`SELECT ${COLUMNAS} ${ORIGEN} WHERE p.id = ?`, [pedidoId])
  if (!pedido) return null
  pedido.detalle = await consulta(
    `SELECT d.producto_id, pr.codigo, pr.nombre AS producto, pr.tipo, pr.unidad_medida, d.cantidad, d.precio_unitario, d.subtotal
     FROM pedido_detalle d JOIN productos pr ON pr.id = d.producto_id WHERE d.pedido_id = ? ORDER BY d.id`,
    [pedidoId]
  )
  pedido.historial = await consulta(
    `SELECT h.estado_anterior, h.estado_nuevo, h.comentario, u.nombre AS usuario, h.creado_en
     FROM pedido_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE h.pedido_id = ? ORDER BY h.id`,
    [pedidoId]
  )
  return pedido
}

export function cambiarEstado(pedidoId, estado, sedeId = null) {
  return consulta('UPDATE pedidos SET estado = ?, sede_id = COALESCE(?, sede_id) WHERE id = ?', [estado, sedeId, pedidoId])
}

export function asignarVendedor(pedidoId, vendedorId) {
  return consulta('UPDATE pedidos SET vendedor_id = ? WHERE id = ?', [vendedorId, pedidoId])
}
