import { consulta, donde, insertar, paginar, uno } from '../db.js'

export function claveActiva(hash) {
  return uno(
    `SELECT k.id, k.cliente_id, c.nombre AS cliente, k.nombre, k.permisos
     FROM api_claves k JOIN clientes c ON c.id = k.cliente_id
     WHERE k.clave_hash = ? AND k.activo = 1 AND c.activo = 1`,
    [hash]
  )
}

export const registrarUso = (id) => consulta('UPDATE api_claves SET ultimo_uso = NOW() WHERE id = ?', [id])

export function listarClaves() {
  return consulta(
    `SELECT k.id, k.cliente_id, c.nombre AS cliente, k.nombre, k.prefijo, k.permisos, k.activo, k.ultimo_uso, k.creado_en
     FROM api_claves k JOIN clientes c ON c.id = k.cliente_id ORDER BY k.id DESC`
  )
}

export function crearClave(d) {
  return insertar(
    'INSERT INTO api_claves (cliente_id, nombre, prefijo, clave_hash, permisos) VALUES (?, ?, ?, ?, ?)',
    [d.cliente_id, d.nombre, d.prefijo, d.clave_hash, d.permisos]
  )
}

export function listarWebhooks() {
  return consulta(
    `SELECT w.id, w.cliente_id, c.nombre AS cliente, w.url, w.evento, w.activo, w.creado_en
     FROM webhooks w JOIN clientes c ON c.id = w.cliente_id ORDER BY w.id DESC`
  )
}

export function crearWebhook(d) {
  return insertar('INSERT INTO webhooks (cliente_id, url, evento, secreto) VALUES (?, ?, ?, ?)', [d.cliente_id, d.url, d.evento, d.secreto])
}

export const buscarWebhook = (id) => uno('SELECT id, cliente_id, url, evento FROM webhooks WHERE id = ?', [id])
export const eliminarWebhook = (id) => consulta('DELETE FROM webhooks WHERE id = ?', [id])

export function webhooksDe(clienteId, evento) {
  return consulta('SELECT id, url, secreto FROM webhooks WHERE cliente_id = ? AND evento = ? AND activo = 1', [clienteId, evento])
}

export function bitacora(d) {
  return insertar(
    'INSERT INTO integracion_bitacora (cliente_id, tipo, referencia, estado, detalle) VALUES (?, ?, ?, ?, ?)',
    [d.cliente_id ?? null, d.tipo, d.referencia?.slice(0, 100) ?? null, d.estado, d.detalle ?? null]
  )
}

export function listarBitacora(f, pag) {
  const filtro = donde([['b.tipo = ?', f.tipo], ['b.estado = ?', f.estado], ['b.cliente_id = ?', f.cliente_id]])
  return paginar({
    seleccion: 'b.id, b.cliente_id, c.nombre AS cliente, b.tipo, b.referencia, b.estado, b.detalle, b.creado_en',
    origen: 'FROM integracion_bitacora b LEFT JOIN clientes c ON c.id = b.cliente_id',
    filtro,
    orden: 'b.id DESC',
    pag
  })
}
