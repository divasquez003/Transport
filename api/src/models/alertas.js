import { consulta, insertar, marcas, uno, valor } from '../db.js'

// ------------------------------------------------------------------ alertas

export async function crear(usuarioIds, a) {
  const filas = usuarioIds.map((id) => [id, a.tipo, a.titulo, a.mensaje, a.prioridad, a.entidad, a.entidad_id])
  await consulta('INSERT INTO alertas (usuario_id, tipo, titulo, mensaje, prioridad, entidad, entidad_id) VALUES ?', [filas])
}

export function listar(usuarioId, soloNoLeidas, limite) {
  return consulta(
    `SELECT id, tipo, titulo, mensaje, prioridad, entidad, entidad_id, leida, leida_en, creado_en
     FROM alertas WHERE usuario_id = ? ${soloNoLeidas ? 'AND leida = 0' : ''}
     ORDER BY leida, FIELD(prioridad, 'alta', 'media', 'baja'), creado_en DESC, id DESC
     LIMIT ?`,
    [usuarioId, limite]
  )
}

export async function noLeidas(usuarioId) {
  return Number(await valor('SELECT COUNT(*) FROM alertas WHERE usuario_id = ? AND leida = 0', [usuarioId]))
}

export const buscar = (id, usuarioId) => uno('SELECT id, leida FROM alertas WHERE id = ? AND usuario_id = ?', [id, usuarioId])

export function marcarLeida(id) {
  return consulta('UPDATE alertas SET leida = 1, leida_en = NOW() WHERE id = ? AND leida = 0', [id])
}

export async function marcarTodas(usuarioId) {
  const r = await consulta('UPDATE alertas SET leida = 1, leida_en = NOW() WHERE usuario_id = ? AND leida = 0', [usuarioId])
  return r.affectedRows
}

// Evita repetir la misma alerta (por ejemplo, el GPS reporta cada minuto)
export async function existeReciente(tipo, entidad, entidadId, minutos) {
  return Number(await valor(
    'SELECT COUNT(*) FROM alertas WHERE tipo = ? AND entidad = ? AND entidad_id = ? AND creado_en >= NOW() - INTERVAL ? MINUTE',
    [tipo, entidad, entidadId, minutos]
  )) > 0
}

// ------------------------------------------------------------------ recordatorios

export function recordatorios(usuarioId, soloPendientes) {
  return consulta(
    `SELECT id, titulo, descripcion, fecha_hora, repeticion, enviado, creado_en FROM recordatorios
     WHERE usuario_id = ? ${soloPendientes ? 'AND enviado = 0' : ''} ORDER BY enviado, fecha_hora`,
    [usuarioId]
  )
}

export function crearRecordatorio(d) {
  return insertar(
    'INSERT INTO recordatorios (usuario_id, titulo, descripcion, fecha_hora, repeticion) VALUES (?, ?, ?, ?, ?)',
    [d.usuario_id, d.titulo, d.descripcion ?? null, d.fecha_hora, d.repeticion]
  )
}

export const buscarRecordatorio = (id) => uno('SELECT * FROM recordatorios WHERE id = ?', [id])
export const eliminarRecordatorio = (id) => consulta('DELETE FROM recordatorios WHERE id = ?', [id])

export function recordatoriosVencidos() {
  return consulta('SELECT * FROM recordatorios WHERE enviado = 0 AND fecha_hora <= NOW() ORDER BY fecha_hora LIMIT 100')
}

export function reprogramarRecordatorio(id, fechaHora) {
  return consulta('UPDATE recordatorios SET fecha_hora = ? WHERE id = ?', [fechaHora, id])
}

export const marcarRecordatorioEnviado = (id) => consulta('UPDATE recordatorios SET enviado = 1 WHERE id = ?', [id])

// ------------------------------------------------------------------ suscripciones Web Push

export async function guardarSuscripcion(usuarioId, s) {
  await consulta('DELETE FROM suscripciones_push WHERE endpoint = ?', [s.endpoint])
  return insertar(
    'INSERT INTO suscripciones_push (usuario_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
    [usuarioId, s.endpoint, s.p256dh, s.auth]
  )
}

export function suscripcionesDe(usuarioIds) {
  if (!usuarioIds.length) return []
  return consulta(`SELECT id, usuario_id, endpoint, p256dh, auth FROM suscripciones_push WHERE usuario_id IN (${marcas(usuarioIds)})`, usuarioIds)
}

export const borrarSuscripcion = (id) => consulta('DELETE FROM suscripciones_push WHERE id = ?', [id])
