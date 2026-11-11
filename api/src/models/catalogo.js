import { actualizarCampos, consulta, donde, insertar, marcas, paginar, uno, valor } from '../db.js'

// ------------------------------------------------------------------ giros de negocio

const SELECT_GIRO = `SELECT g.id, g.codigo, g.nombre, g.descripcion, g.slogan, g.imagen_url, g.activo,
    (SELECT COUNT(*) FROM sedes s WHERE s.giro_id = g.id AND s.activo = 1) AS total_sedes,
    (SELECT COUNT(*) FROM productos p WHERE p.giro_id = g.id AND p.activo = 1) AS total_productos
  FROM giros_negocio g`

export const listarGiros = () => consulta(`${SELECT_GIRO} WHERE g.activo = 1 ORDER BY g.id`)
export const buscarGiro = (id) => uno(`${SELECT_GIRO} WHERE g.id = ?`, [id])
export const actualizarGiro = (id, d) => actualizarCampos('giros_negocio', id, d, ['nombre', 'descripcion', 'slogan', 'imagen_url', 'activo'])

// ------------------------------------------------------------------ sedes

const SELECT_SEDE = `SELECT s.id, s.giro_id, g.nombre AS giro, s.nombre, s.tipo, s.departamento, s.municipio,
    s.direccion, s.telefono, s.activo
  FROM sedes s LEFT JOIN giros_negocio g ON g.id = s.giro_id`

export function listarSedes(f = {}) {
  const filtro = donde([
    ['s.activo = 1'],
    ['s.giro_id = ?', f.giro_id],
    ['s.tipo = ?', f.tipo],
    ['s.departamento = ?', f.departamento]
  ])
  return consulta(`${SELECT_SEDE} ${filtro.sql} ORDER BY s.giro_id IS NOT NULL, s.giro_id, s.id`, filtro.parametros)
}

export const buscarSede = (id) => uno(`${SELECT_SEDE} WHERE s.id = ?`, [id])

export function crearSede(d) {
  return insertar(
    'INSERT INTO sedes (giro_id, nombre, tipo, departamento, municipio, direccion, telefono) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [d.giro_id ?? null, d.nombre, d.tipo, d.departamento, d.municipio ?? null, d.direccion ?? null, d.telefono ?? null]
  )
}

export const actualizarSede = (id, d) => actualizarCampos('sedes', id, d, ['giro_id', 'nombre', 'tipo', 'departamento', 'municipio', 'direccion', 'telefono', 'activo'])

export function resumenSede(id) {
  return uno(
    `SELECT (SELECT COUNT(*) FROM usuarios WHERE sede_id = ? AND activo = 1) AS personal,
            (SELECT COUNT(*) FROM existencias WHERE sede_id = ? AND cantidad > 0) AS productos_en_existencia,
            (SELECT COUNT(*) FROM existencias WHERE sede_id = ? AND cantidad < minimo) AS productos_bajo_minimo`,
    [id, id, id]
  )
}

// ------------------------------------------------------------------ productos y servicios

export const TIPOS_PRODUCTO = 'producto,materia_prima,servicio,alquiler'
export const MODALIDADES = 'en_linea,cotizacion'
export const EDITABLES_PRODUCTO = ['codigo', 'nombre', 'descripcion', 'tipo', 'unidad_medida', 'precio', 'modalidad_venta', 'imagen_url', 'activo']

const SELECT_PRODUCTO = `p.id, p.giro_id, g.nombre AS giro, p.codigo, p.nombre, p.descripcion, p.tipo,
  p.unidad_medida, p.precio, p.modalidad_venta, p.imagen_url, p.activo`

export function listarProductos(f, pag) {
  const filtro = donde([
    f.incluirInactivos ? ['1 = 1'] : ['p.activo = 1'],
    ['p.giro_id = ?', f.giro_id],
    ['p.tipo = ?', f.tipo],
    ['p.modalidad_venta = ?', f.modalidad],
    ['(p.nombre LIKE ? OR p.codigo LIKE ? OR p.descripcion LIKE ?)', ...(f.buscar ? Array(3).fill(`%${f.buscar}%`) : [undefined])]
  ])
  return paginar({
    seleccion: SELECT_PRODUCTO,
    origen: 'FROM productos p JOIN giros_negocio g ON g.id = p.giro_id',
    filtro,
    orden: 'p.giro_id, p.nombre',
    pag
  })
}

export async function buscarProducto(id, incluirInactivos = false) {
  const producto = await uno(
    `SELECT ${SELECT_PRODUCTO} FROM productos p JOIN giros_negocio g ON g.id = p.giro_id
     WHERE p.id = ? ${incluirInactivos ? '' : 'AND p.activo = 1'}`,
    [id]
  )
  if (!producto) return null
  producto.disponibilidad = await consulta(
    `SELECT e.sede_id, s.nombre AS sede, e.cantidad FROM existencias e JOIN sedes s ON s.id = e.sede_id
     WHERE e.producto_id = ? AND e.cantidad > 0 ORDER BY e.cantidad DESC`,
    [id]
  )
  return producto
}

// Productos indexados por id, para armar pedidos
export async function productosPorIds(ids) {
  if (!ids.length) return new Map()
  const filas = await consulta(
    `SELECT id, giro_id, codigo, nombre, tipo, unidad_medida, precio, modalidad_venta, activo FROM productos WHERE id IN (${marcas(ids)})`,
    ids
  )
  return new Map(filas.map((f) => [f.id, f]))
}

export const productoPorCodigo = (codigo) => uno('SELECT id, giro_id, codigo, nombre, tipo, precio, modalidad_venta, activo FROM productos WHERE codigo = ?', [codigo])

export async function existeCodigoProducto(codigo, exceptoId = 0) {
  return Number(await valor('SELECT COUNT(*) FROM productos WHERE codigo = ? AND id <> ?', [codigo, exceptoId])) > 0
}

export function crearProducto(d) {
  return insertar(
    `INSERT INTO productos (giro_id, codigo, nombre, descripcion, tipo, unidad_medida, precio, modalidad_venta, imagen_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.giro_id, d.codigo, d.nombre, d.descripcion ?? null, d.tipo, d.unidad_medida, d.precio, d.modalidad_venta ?? 'en_linea', d.imagen_url ?? null]
  )
}

export const actualizarProducto = (id, d) => actualizarCampos('productos', id, d, EDITABLES_PRODUCTO)

// Solo los productos físicos llevan control de existencias
export const llevaInventario = (producto) => ['producto', 'materia_prima'].includes(producto.tipo)
