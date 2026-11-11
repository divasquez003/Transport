import { conflicto, creado, id, invalido, noEncontrado, ok, paginacion, paginado, prohibido } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import { esCentral, esGestion, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Maquinaria from '../models/maquinaria.js'

// ------------------------------------------------------------------ giros de negocio

export async function listarGiros(req, res) {
  ok(res, await Catalogo.listarGiros())
}

// Página de cada giro en la sala de ventas: datos, sedes, catálogo y maquinaria disponible
export async function verGiro(req, res) {
  const giro = await Catalogo.buscarGiro(id(req))
  if (!giro || !giro.activo) throw noEncontrado('Giro de negocio')
  giro.sedes = await Catalogo.listarSedes({ giro_id: giro.id })
  ;[giro.catalogo] = await Catalogo.listarProductos({ giro_id: giro.id }, { porPagina: 100, desde: 0 })
  if (giro.codigo === 'MAQUINARIA') giro.maquinas = await Maquinaria.listarMaquinas({ giro_id: giro.id, publico: true })
  ok(res, giro)
}

export async function actualizarGiro(req, res) {
  const giroId = id(req)
  if (!(await Catalogo.buscarGiro(giroId))) throw noEncontrado('Giro de negocio')
  const datos = validar(req.body, {
    nombre: 'texto|max:80',
    descripcion: 'texto|max:2000',
    slogan: 'texto|max:150',
    imagen_url: 'texto|max:255',
    activo: 'booleano'
  })
  if (!Object.keys(datos).length) throw invalido({}, 'Envíe al menos un campo para actualizar')
  await Catalogo.actualizarGiro(giroId, datos)
  ok(res, await Catalogo.buscarGiro(giroId))
}

// ------------------------------------------------------------------ sedes

const TIPOS_SEDE = 'central,planta_extraccion,planta_proceso,sucursal,base_operaciones,oficina_proyectos,bodega'

export async function listarSedes(req, res) {
  const f = validar(req.query, { giro_id: 'entero', tipo: `en:${TIPOS_SEDE}`, departamento: 'texto' })
  ok(res, await Catalogo.listarSedes(f))
}

export async function verSede(req, res) {
  const sede = await Catalogo.buscarSede(id(req))
  if (!sede || !sede.activo) throw noEncontrado('Sede', 'a')
  if (req.usuario && !req.usuario.cliente_id) sede.resumen = await Catalogo.resumenSede(sede.id)
  ok(res, sede)
}

async function datosSede(body, parcial) {
  const r = parcial ? '' : 'requerido|'
  const datos = validar(body, {
    giro_id: 'entero',
    nombre: `${r}texto|max:100`,
    tipo: `${r}en:${TIPOS_SEDE}`,
    departamento: `${r}texto|max:50`,
    municipio: 'texto|max:60',
    direccion: 'texto|max:200',
    telefono: 'texto|max:20',
    activo: 'booleano'
  })
  if (datos.tipo === 'central') datos.giro_id = null
  else if (datos.giro_id !== undefined && !(await Catalogo.buscarGiro(datos.giro_id))) throw invalido({ giro_id: 'El giro no existe' })
  return datos
}

export async function crearSede(req, res) {
  const datos = await datosSede(req.body, false)
  if (datos.tipo !== 'central' && !datos.giro_id) throw invalido({ giro_id: 'Es obligatorio, salvo para la sede central' })
  const nueva = await Catalogo.crearSede(datos)
  creado(res, await Catalogo.buscarSede(nueva), 'Sede creada')
}

export async function actualizarSede(req, res) {
  const sedeId = id(req)
  if (!(await Catalogo.buscarSede(sedeId))) throw noEncontrado('Sede', 'a')
  const datos = await datosSede(req.body, true)
  if (!Object.keys(datos).length) throw invalido({}, 'Envíe al menos un campo para actualizar')
  await Catalogo.actualizarSede(sedeId, datos)
  ok(res, await Catalogo.buscarSede(sedeId))
}

// ------------------------------------------------------------------ productos y servicios

// Catálogo público; el personal de gestión puede incluir inactivos con ?incluir_inactivos=1
export async function listarProductos(req, res) {
  const f = validar(req.query, {
    giro_id: 'entero',
    tipo: `en:${Catalogo.TIPOS_PRODUCTO}`,
    modalidad: `en:${Catalogo.MODALIDADES}`,
    buscar: 'texto|max:60',
    incluir_inactivos: 'booleano'
  })
  f.incluirInactivos = Boolean(f.incluir_inactivos && esGestion(req.usuario))
  const pag = paginacion(req.query, 20, 100)
  const [filas, total] = await Catalogo.listarProductos(f, pag)
  paginado(res, filas, total, pag)
}

export async function verProducto(req, res) {
  const producto = await Catalogo.buscarProducto(id(req), esGestion(req.usuario))
  if (!producto) throw noEncontrado('Producto')
  ok(res, producto)
}

const REGLAS_PRODUCTO = {
  codigo: 'texto|max:30',
  nombre: 'texto|max:120',
  descripcion: 'texto|max:2000',
  tipo: `en:${Catalogo.TIPOS_PRODUCTO}`,
  unidad_medida: 'texto|max:20',
  precio: 'numero|no_negativo|hasta:99999999',
  modalidad_venta: `en:${Catalogo.MODALIDADES}`,
  imagen_url: 'texto|max:255'
}

export async function crearProducto(req, res) {
  const central = esCentral(req.usuario)
  const datos = validar(req.body, {
    ...REGLAS_PRODUCTO,
    giro_id: central ? 'requerido|entero' : 'entero',
    codigo: 'requerido|texto|max:30',
    nombre: 'requerido|texto|max:120',
    tipo: `requerido|en:${Catalogo.TIPOS_PRODUCTO}`,
    unidad_medida: 'requerido|texto|max:20',
    precio: 'requerido|numero|no_negativo|hasta:99999999'
  })
  // Gerentes y administrativos solo crean productos de su propio giro
  const giroId = central ? datos.giro_id : req.usuario.giro_id
  if (!central && datos.giro_id && datos.giro_id !== giroId) throw prohibido('Solo puede crear productos de su giro de negocio')
  if (!(await Catalogo.buscarGiro(giroId))) throw invalido({ giro_id: 'El giro de negocio no existe' })
  datos.codigo = String(datos.codigo).toUpperCase()
  if (await Catalogo.existeCodigoProducto(datos.codigo)) throw conflicto('Ya existe un producto con ese código')
  const nuevo = await Catalogo.crearProducto({ ...datos, giro_id: giroId })
  creado(res, await Catalogo.buscarProducto(nuevo, true), 'Producto creado')
}

async function productoDeMiGiro(req) {
  const producto = await Catalogo.buscarProducto(id(req), true)
  if (!producto) throw noEncontrado('Producto')
  if (!puedeVerGiro(req.usuario, producto.giro_id)) throw prohibido('Solo puede modificar productos de su giro de negocio')
  return producto
}

// Actualización parcial: solo se cambian los campos enviados
export async function actualizarProducto(req, res) {
  const producto = await productoDeMiGiro(req)
  const datos = validar(req.body, { ...REGLAS_PRODUCTO, activo: 'booleano' })
  if (!Object.keys(datos).length) throw invalido({}, 'Envíe al menos un campo para actualizar')
  if (datos.codigo) {
    datos.codigo = String(datos.codigo).toUpperCase()
    if (await Catalogo.existeCodigoProducto(datos.codigo, producto.id)) throw conflicto('Ya existe un producto con ese código')
  }
  await Catalogo.actualizarProducto(producto.id, datos)
  ok(res, await Catalogo.buscarProducto(producto.id, true))
}

// Baja lógica: el producto deja de aparecer en el catálogo, pero su historial se conserva
export async function eliminarProducto(req, res) {
  const producto = await productoDeMiGiro(req)
  await Catalogo.actualizarProducto(producto.id, { activo: false })
  ok(res, { id: producto.id, activo: false, mensaje: 'Producto dado de baja' })
}
