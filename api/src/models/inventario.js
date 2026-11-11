import { consulta, donde, insertar, paginar, uno } from '../db.js'

export async function existencias(f) {
  const filtro = donde([
    ['e.sede_id = ?', f.sede_id],
    ['s.giro_id = ?', f.giro_id],
    ['e.producto_id = ?', f.producto_id],
    f.bajo_minimo ? ['e.cantidad < e.minimo'] : ['1 = 1']
  ])
  const filas = await consulta(
    `SELECT e.sede_id, s.nombre AS sede, s.giro_id, g.nombre AS giro, e.producto_id, p.codigo, p.nombre AS producto,
            p.unidad_medida, e.cantidad, e.minimo, (e.cantidad < e.minimo) AS bajo_minimo, e.actualizado_en
     FROM existencias e
     JOIN sedes s ON s.id = e.sede_id
     LEFT JOIN giros_negocio g ON g.id = s.giro_id
     JOIN productos p ON p.id = e.producto_id
     ${filtro.sql}
     ORDER BY s.giro_id, s.id, p.nombre`,
    filtro.parametros
  )
  return filas.map((e) => ({ ...e, bajo_minimo: Boolean(e.bajo_minimo) }))
}

// FOR UPDATE bloquea la fila hasta terminar la transacción (evita vender dos veces la misma existencia)
export function existenciaBloqueada(sedeId, productoId) {
  return uno('SELECT cantidad, minimo FROM existencias WHERE sede_id = ? AND producto_id = ? FOR UPDATE', [sedeId, productoId])
}

export function guardarExistencia(sedeId, productoId, cantidad) {
  return consulta(
    `INSERT INTO existencias (sede_id, producto_id, cantidad) VALUES (?, ?, ?) AS nuevo
     ON DUPLICATE KEY UPDATE cantidad = nuevo.cantidad`,
    [sedeId, productoId, cantidad]
  )
}

export function registrarMovimiento(m) {
  return insertar(
    'INSERT INTO movimientos_inventario (sede_id, producto_id, tipo, cantidad, referencia, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
    [m.sede_id, m.producto_id, m.tipo, m.cantidad, m.referencia ?? null, m.usuario_id ?? null]
  )
}

export function movimientos(f, pag) {
  const filtro = donde([
    ['m.sede_id = ?', f.sede_id],
    ['s.giro_id = ?', f.giro_id],
    ['m.producto_id = ?', f.producto_id],
    ['m.tipo = ?', f.tipo],
    ['m.creado_en >= ?', f.desde && `${f.desde} 00:00:00`],
    ['m.creado_en <= ?', f.hasta && `${f.hasta} 23:59:59`]
  ])
  return paginar({
    seleccion: `m.id, m.sede_id, s.nombre AS sede, m.producto_id, p.nombre AS producto, p.unidad_medida, m.tipo,
      m.cantidad, m.referencia, u.nombre AS usuario, m.creado_en`,
    origen: `FROM movimientos_inventario m
      JOIN sedes s ON s.id = m.sede_id
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN usuarios u ON u.id = m.usuario_id`,
    filtro,
    orden: 'm.creado_en DESC, m.id DESC',
    pag
  })
}
