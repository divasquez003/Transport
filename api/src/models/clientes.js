import { actualizarCampos, consulta, donde, insertar, paginar, uno, valor } from '../db.js'
import { contactosDeCliente } from './usuarios.js'

const CAMPOS = 'c.id, c.tipo, c.nombre, c.nit, c.correo, c.telefono, c.direccion, c.es_extranjero, c.activo, c.creado_en'
export const EDITABLES = ['tipo', 'nombre', 'nit', 'correo', 'telefono', 'direccion', 'es_extranjero', 'activo']

export function listar(f, pag) {
  const filtro = donde([
    ['(c.nombre LIKE ? OR c.nit LIKE ? OR c.correo LIKE ?)', ...(f.buscar ? Array(3).fill(`%${f.buscar}%`) : [undefined])],
    ['c.tipo = ?', f.tipo],
    ['c.activo = ?', f.activo]
  ])
  return paginar({
    seleccion: `${CAMPOS},
      (SELECT COUNT(*) FROM pedidos pe WHERE pe.cliente_id = c.id) AS total_pedidos,
      (SELECT COALESCE(SUM(pe.total), 0) FROM pedidos pe WHERE pe.cliente_id = c.id AND pe.estado <> 'cancelado') AS total_comprado`,
    origen: 'FROM clientes c',
    filtro,
    orden: 'c.nombre',
    pag
  })
}

// Ficha del cliente con su relación con cada giro de negocio
export async function buscar(id) {
  const cliente = await uno(`SELECT ${CAMPOS} FROM clientes c WHERE c.id = ?`, [id])
  if (!cliente) return null
  cliente.contactos = await contactosDeCliente(id)
  cliente.resumen_por_giro = await consulta(
    `SELECT g.id AS giro_id, g.nombre AS giro, COUNT(*) AS pedidos,
            SUM(CASE WHEN p.estado <> 'cancelado' THEN p.total ELSE 0 END) AS total_comprado,
            MAX(p.creado_en) AS ultimo_pedido
     FROM pedidos p JOIN giros_negocio g ON g.id = p.giro_id
     WHERE p.cliente_id = ? GROUP BY g.id, g.nombre ORDER BY g.id`,
    [id]
  )
  const estados = await consulta('SELECT estado, COUNT(*) AS cantidad FROM pedidos WHERE cliente_id = ? GROUP BY estado', [id])
  cliente.pedidos_por_estado = Object.fromEntries(estados.map((e) => [e.estado, e.cantidad]))
  cliente.reuniones_pendientes = Number(await valor(
    "SELECT COUNT(*) FROM reuniones WHERE cliente_id = ? AND estado IN ('solicitada', 'confirmada')", [id]
  ))
  return cliente
}

export const basico = (id) => uno('SELECT id, tipo, nombre, nit, activo FROM clientes WHERE id = ?', [id])
export const porNit = (nit) => uno('SELECT id, tipo, nombre, nit, activo FROM clientes WHERE nit = ?', [nit])

export async function existeNit(nit, exceptoId = 0) {
  return Number(await valor('SELECT COUNT(*) FROM clientes WHERE nit = ? AND id <> ?', [nit, exceptoId])) > 0
}

export function crear(d) {
  return insertar(
    'INSERT INTO clientes (tipo, nombre, nit, correo, telefono, direccion, es_extranjero) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [d.tipo ?? 'empresa', d.nombre, d.nit ?? null, d.correo ?? null, d.telefono ?? null, d.direccion ?? null, d.es_extranjero ? 1 : 0]
  )
}

export const actualizar = (id, d) => actualizarCampos('clientes', id, d, EDITABLES)
