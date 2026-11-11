import { consulta, donde, insertar, marcas, uno, valor } from '../db.js'

const SELECT = `SELECT u.id, u.nombre, u.correo, u.telefono, r.codigo AS rol, r.nombre AS rol_nombre,
    u.giro_id, g.codigo AS giro_codigo, g.nombre AS giro, u.sede_id, s.nombre AS sede,
    u.cliente_id, c.nombre AS cliente, u.activo, u.ultimo_acceso, u.creado_en
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id
  LEFT JOIN giros_negocio g ON g.id = u.giro_id
  LEFT JOIN sedes s ON s.id = u.sede_id
  LEFT JOIN clientes c ON c.id = u.cliente_id`

export const sesion = (id) => uno(`${SELECT} WHERE u.id = ? AND u.activo = 1`, [id])
export const buscar = (id) => uno(`${SELECT} WHERE u.id = ?`, [id])
export const buscarPersonal = (id) => uno(`${SELECT} WHERE u.id = ? AND u.cliente_id IS NULL`, [id])
export const credenciales = (correo) => uno('SELECT id, password_hash, activo FROM usuarios WHERE correo = ?', [correo])
export const passwordHash = (id) => valor('SELECT password_hash FROM usuarios WHERE id = ?', [id])
export const roles = () => consulta('SELECT id, codigo, nombre, descripcion FROM roles ORDER BY id')

export function registrarAcceso(id) {
  return consulta('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [id])
}

export async function existeCorreo(correo, exceptoId = 0) {
  return Number(await valor('SELECT COUNT(*) FROM usuarios WHERE correo = ? AND id <> ?', [correo, exceptoId])) > 0
}

export function crear(d) {
  return insertar(
    `INSERT INTO usuarios (rol_id, giro_id, sede_id, cliente_id, nombre, correo, telefono, password_hash)
     VALUES ((SELECT id FROM roles WHERE codigo = ?), ?, ?, ?, ?, ?, ?, ?)`,
    [d.rol, d.giro_id ?? null, d.sede_id ?? null, d.cliente_id ?? null, d.nombre, d.correo, d.telefono ?? null, d.password_hash]
  )
}

const EDITABLES = ['nombre', 'correo', 'telefono', 'giro_id', 'sede_id', 'password_hash']

export function actualizar(id, d) {
  const asignaciones = []
  const parametros = []
  for (const campo of EDITABLES) {
    if (campo in d) {
      asignaciones.push(`${campo} = ?`)
      parametros.push(d[campo])
    }
  }
  if ('rol' in d) {
    asignaciones.push('rol_id = (SELECT id FROM roles WHERE codigo = ?)')
    parametros.push(d.rol)
  }
  if (!asignaciones.length) return null
  return consulta(`UPDATE usuarios SET ${asignaciones.join(', ')} WHERE id = ?`, [...parametros, id])
}

export function cambiarEstado(id, activo) {
  return consulta('UPDATE usuarios SET activo = ? WHERE id = ?', [activo ? 1 : 0, id])
}

export function cambiarPassword(id, hash) {
  return consulta('UPDATE usuarios SET password_hash = ?, reset_token_hash = NULL, reset_expira = NULL WHERE id = ?', [hash, id])
}

export function guardarRecuperacion(id, hashToken) {
  return consulta('UPDATE usuarios SET reset_token_hash = ?, reset_expira = NOW() + INTERVAL 30 MINUTE WHERE id = ?', [hashToken, id])
}

export function porRecuperacion(hashToken) {
  return uno('SELECT id FROM usuarios WHERE reset_token_hash = ? AND reset_expira > NOW() AND activo = 1', [hashToken])
}

// Personal de la empresa (sin usuarios del portal de clientes)
export function listarPersonal(f) {
  const filtro = donde([
    ['u.cliente_id IS NULL'],
    ['u.giro_id = ?', f.giro_id],
    ['r.codigo = ?', f.rol],
    ['u.sede_id = ?', f.sede_id],
    ['u.activo = ?', f.activo]
  ])
  return consulta(`${SELECT} ${filtro.sql} ORDER BY u.giro_id IS NOT NULL, u.giro_id, r.id, u.nombre`, filtro.parametros)
}

export function contactosDeCliente(clienteId) {
  return consulta('SELECT id, nombre, correo, telefono, activo, ultimo_acceso FROM usuarios WHERE cliente_id = ? ORDER BY nombre', [clienteId])
}

// Destinatarios de alertas
export async function idsPorGiro(giroId, roles) {
  const filas = await consulta(
    `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.activo = 1 AND u.giro_id = ? AND r.codigo IN (${marcas(roles)})`,
    [giroId, ...roles]
  )
  return filas.map((f) => f.id)
}

export async function idsPorRol(roles) {
  const filas = await consulta(
    `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.activo = 1 AND r.codigo IN (${marcas(roles)})`,
    roles
  )
  return filas.map((f) => f.id)
}

export async function idsDeCliente(clienteId) {
  const filas = await consulta('SELECT id FROM usuarios WHERE activo = 1 AND cliente_id = ?', [clienteId])
  return filas.map((f) => f.id)
}
