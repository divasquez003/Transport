import { consulta, donde } from '../db.js'

// Una línea por producto de cada pedido, como la esperan los sistemas de compras de los clientes
export function pedidosConDetalle(f) {
  const filtro = donde([
    ['p.giro_id = ?', f.giro_id],
    ['p.cliente_id = ?', f.cliente_id],
    ['p.estado = ?', f.estado],
    ['p.creado_en >= ?', `${f.desde} 00:00:00`],
    ['p.creado_en <= ?', `${f.hasta} 23:59:59`]
  ])
  return consulta(
    `SELECT p.codigo AS pedido, DATE_FORMAT(p.creado_en, '%Y-%m-%d') AS fecha, c.nit, c.nombre AS cliente, g.codigo AS giro,
            p.estado, pr.codigo AS codigo_producto, pr.nombre AS producto, pr.unidad_medida, d.cantidad, d.precio_unitario,
            d.subtotal, p.total AS total_pedido, p.fecha_entrega, p.direccion_entrega
     FROM pedidos p
     JOIN clientes c ON c.id = p.cliente_id
     JOIN giros_negocio g ON g.id = p.giro_id
     JOIN pedido_detalle d ON d.pedido_id = p.id
     JOIN productos pr ON pr.id = d.producto_id
     ${filtro.sql}
     ORDER BY p.creado_en, p.id, d.id
     LIMIT 10000`,
    filtro.parametros
  )
}

export function viajes(f) {
  const filtro = donde([
    ['vj.giro_id = ?', f.giro_id],
    ['vj.cliente_id = ?', f.cliente_id],
    ['vj.estado = ?', f.estado],
    ['COALESCE(vj.salida_real, vj.salida_programada) >= ?', `${f.desde} 00:00:00`],
    ['COALESCE(vj.salida_real, vj.salida_programada) <= ?', `${f.hasta} 23:59:59`]
  ])
  return consulta(
    `SELECT vj.codigo AS viaje, vj.estado, vj.tipo_ruta, vj.origen, vj.destino, ve.placa, c.nit, c.nombre AS cliente,
            pe.codigo AS pedido, pin.codigo AS pedido_interno, vj.carga_descripcion, vj.peso_ton, vj.salida_programada,
            vj.salida_real, vj.llegada_real, vj.tarifa
     FROM viajes vj
     JOIN vehiculos ve ON ve.id = vj.vehiculo_id
     LEFT JOIN clientes c ON c.id = vj.cliente_id
     LEFT JOIN pedidos pe ON pe.id = vj.pedido_id
     LEFT JOIN pedidos_internos pin ON pin.id = vj.pedido_interno_id
     ${filtro.sql}
     ORDER BY COALESCE(vj.salida_real, vj.salida_programada)
     LIMIT 10000`,
    filtro.parametros
  )
}

export function movimientos(f) {
  const filtro = donde([
    ['s.giro_id = ?', f.giro_id],
    ['m.creado_en >= ?', `${f.desde} 00:00:00`],
    ['m.creado_en <= ?', `${f.hasta} 23:59:59`]
  ])
  return consulta(
    `SELECT DATE_FORMAT(m.creado_en, '%Y-%m-%d %H:%i') AS fecha, s.id AS sede_id, s.nombre AS sede, p.codigo AS codigo_producto,
            p.nombre AS producto, p.unidad_medida, m.tipo, m.cantidad, m.referencia
     FROM movimientos_inventario m JOIN sedes s ON s.id = m.sede_id JOIN productos p ON p.id = m.producto_id
     ${filtro.sql}
     ORDER BY m.creado_en, m.id
     LIMIT 10000`,
    filtro.parametros
  )
}
