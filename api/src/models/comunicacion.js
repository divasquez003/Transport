import { consulta, donde, insertar, paginar, uno } from '../db.js'

// ------------------------------------------------------------------ reuniones

export const ESTADOS_REUNION = 'solicitada,confirmada,realizada,cancelada'
export const MODALIDADES = 'presencial,videoconferencia'

const COLUMNAS_REUNION = `r.id, r.asunto, r.estado, r.fecha_hora, r.modalidad, r.lugar, r.enlace, r.notas,
  r.cliente_id, c.nombre AS cliente, r.giro_id, g.nombre AS giro, r.producto_id, pr.nombre AS producto,
  r.vendedor_id, v.nombre AS vendedor, v.correo AS vendedor_correo, v.telefono AS vendedor_telefono,
  r.creado_en, r.actualizado_en`

const ORIGEN_REUNION = `FROM reuniones r
  JOIN clientes c ON c.id = r.cliente_id
  JOIN giros_negocio g ON g.id = r.giro_id
  LEFT JOIN productos pr ON pr.id = r.producto_id
  LEFT JOIN usuarios v ON v.id = r.vendedor_id`

export function crearReunion(d) {
  return insertar(
    `INSERT INTO reuniones (cliente_id, giro_id, producto_id, solicitado_por, asunto, fecha_hora, modalidad, lugar, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.cliente_id, d.giro_id, d.producto_id ?? null, d.solicitado_por ?? null, d.asunto, d.fecha_hora, d.modalidad, d.lugar ?? null, d.notas ?? null]
  )
}

export function listarReuniones(f, pag) {
  const filtro = donde([
    ['r.cliente_id = ?', f.cliente_id],
    ['r.giro_id = ?', f.giro_id],
    ['r.vendedor_id = ?', f.vendedor_id],
    ['r.estado = ?', f.estado],
    ['r.fecha_hora >= ?', f.desde && `${f.desde} 00:00:00`]
  ])
  return paginar({
    seleccion: COLUMNAS_REUNION,
    origen: ORIGEN_REUNION,
    filtro,
    orden: "FIELD(r.estado, 'solicitada', 'confirmada') = 0, r.fecha_hora, r.id",
    pag
  })
}

export const buscarReunion = (id) => uno(`SELECT ${COLUMNAS_REUNION} ${ORIGEN_REUNION} WHERE r.id = ?`, [id])

export function asignarReunion(id, vendedorId, fechaHora, lugar, enlace) {
  return consulta(
    "UPDATE reuniones SET vendedor_id = ?, fecha_hora = ?, lugar = ?, enlace = ?, estado = 'confirmada' WHERE id = ?",
    [vendedorId, fechaHora, lugar ?? null, enlace ?? null, id]
  )
}

export function cambiarEstadoReunion(id, estado, notas) {
  return consulta('UPDATE reuniones SET estado = ?, notas = COALESCE(?, notas) WHERE id = ?', [estado, notas ?? null, id])
}

// ------------------------------------------------------------------ conversaciones cliente - empresa

const COLUMNAS_CONVERSACION = `cv.id, cv.cliente_id, c.nombre AS cliente, cv.giro_id, g.nombre AS giro, cv.asunto, cv.estado, cv.creado_en,
  (SELECT m.contenido FROM mensajes m WHERE m.conversacion_id = cv.id ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje,
  (SELECT m.creado_en FROM mensajes m WHERE m.conversacion_id = cv.id ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje_en`

const ORIGEN_CONVERSACION = `FROM conversaciones cv
  JOIN clientes c ON c.id = cv.cliente_id
  LEFT JOIN giros_negocio g ON g.id = cv.giro_id`

// soyCliente: cuenta como no leídos los mensajes que escribió la otra parte
export function listarConversaciones(f, soyCliente, pag) {
  const filtro = donde([['cv.cliente_id = ?', f.cliente_id], ['cv.giro_id = ?', f.giro_id], ['cv.estado = ?', f.estado]])
  return paginar({
    seleccion: `${COLUMNAS_CONVERSACION},
      (SELECT COUNT(*) FROM mensajes m JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.conversacion_id = cv.id AND m.leido = 0 AND u.cliente_id IS ${soyCliente ? 'NULL' : 'NOT NULL'}) AS no_leidos`,
    origen: ORIGEN_CONVERSACION,
    filtro,
    orden: 'ultimo_mensaje_en DESC, cv.id DESC',
    pag
  })
}

export const buscarConversacion = (id) => uno(`SELECT ${COLUMNAS_CONVERSACION} ${ORIGEN_CONVERSACION} WHERE cv.id = ?`, [id])

export function crearConversacion(d) {
  return insertar('INSERT INTO conversaciones (cliente_id, giro_id, asunto) VALUES (?, ?, ?)', [d.cliente_id, d.giro_id ?? null, d.asunto])
}

export async function mensajes(conversacionId) {
  const filas = await consulta(
    `SELECT m.id, m.usuario_id, u.nombre AS autor, (u.cliente_id IS NOT NULL) AS es_cliente, m.contenido, m.leido, m.creado_en
     FROM mensajes m JOIN usuarios u ON u.id = m.usuario_id WHERE m.conversacion_id = ? ORDER BY m.id`,
    [conversacionId]
  )
  return filas.map((m) => ({ ...m, es_cliente: Boolean(m.es_cliente) }))
}

export function agregarMensaje(conversacionId, usuarioId, contenido) {
  return insertar('INSERT INTO mensajes (conversacion_id, usuario_id, contenido) VALUES (?, ?, ?)', [conversacionId, usuarioId, contenido])
}

// Al abrir la conversación se marcan como leídos los mensajes de la otra parte
export function marcarLeidos(conversacionId, soyCliente) {
  return consulta(
    `UPDATE mensajes m JOIN usuarios u ON u.id = m.usuario_id SET m.leido = 1
     WHERE m.conversacion_id = ? AND m.leido = 0 AND u.cliente_id IS ${soyCliente ? 'NULL' : 'NOT NULL'}`,
    [conversacionId]
  )
}

export function cambiarEstadoConversacion(id, estado) {
  return consulta('UPDATE conversaciones SET estado = ? WHERE id = ?', [estado, id])
}
