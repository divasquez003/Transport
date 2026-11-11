import bcrypt from 'bcryptjs'
import { conflicto, creado, id, invalido, noEncontrado, ok, prohibido } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import { esCentral } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Usuarios from '../models/usuarios.js'

const ROLES_PERSONAL = 'dueno,admin_general,gerente,administrativo,vendedor,operativo'

// Personal de la empresa; el gerente solo ve el de su giro (sirve para elegir vendedores y pilotos)
export async function listar(req, res) {
  const f = validar(req.query, { rol: `en:${ROLES_PERSONAL}`, giro_id: 'entero', sede_id: 'entero', activo: 'booleano' })
  f.activo = f.activo ?? true
  if (!esCentral(req.usuario)) f.giro_id = req.usuario.giro_id
  ok(res, await Usuarios.listarPersonal(f))
}

export async function roles(req, res) {
  ok(res, await Usuarios.roles())
}

// Los roles de sede central no tienen giro; los demás deben pertenecer a un giro y a una sede de ese giro
async function revisarAsignacion({ rol, giro_id: giroId, sede_id: sedeId }) {
  const central = ['dueno', 'admin_general'].includes(rol)
  const giro = central ? null : giroId
  if (!central && !giro) throw invalido({ giro_id: 'Es obligatorio para este rol' })
  if (giro && !(await Catalogo.buscarGiro(giro))) throw invalido({ giro_id: 'El giro no existe' })
  let sede = sedeId ?? null
  if (central && !sede) sede = 1
  if (sede) {
    const registro = await Catalogo.buscarSede(sede)
    if (!registro || (registro.giro_id ?? null) !== (giro ?? null)) {
      throw invalido({ sede_id: central ? 'Debe ser la sede central' : 'La sede no pertenece al giro' })
    }
  }
  return { giro_id: giro, sede_id: sede }
}

export async function crear(req, res) {
  const datos = validar(req.body, {
    nombre: 'requerido|texto|max:100',
    correo: 'requerido|correo|max:120',
    password: 'requerido|texto|min:8|max:72',
    telefono: 'texto|max:20',
    rol: `requerido|en:${ROLES_PERSONAL}`,
    giro_id: 'entero',
    sede_id: 'entero'
  })
  datos.correo = datos.correo.toLowerCase()
  if (await Usuarios.existeCorreo(datos.correo)) throw conflicto('Ya existe un usuario con ese correo')
  const asignacion = await revisarAsignacion(datos)
  const nuevo = await Usuarios.crear({ ...datos, ...asignacion, password_hash: await bcrypt.hash(String(datos.password), 10) })
  creado(res, await Usuarios.buscar(nuevo), 'Usuario creado')
}

export async function actualizar(req, res) {
  const usuarioId = id(req)
  const actual = await Usuarios.buscarPersonal(usuarioId)
  if (!actual) throw noEncontrado('Usuario')
  const datos = validar(req.body, {
    nombre: 'texto|max:100',
    correo: 'correo|max:120',
    telefono: 'texto|max:20',
    rol: `en:${ROLES_PERSONAL}`,
    giro_id: 'entero',
    sede_id: 'entero',
    password: 'texto|min:8|max:72'
  })
  if (!Object.keys(datos).length) throw invalido({}, 'Envíe al menos un campo para actualizar')
  if (datos.rol && datos.rol !== actual.rol && usuarioId === req.usuario.id) throw prohibido('No puede cambiar su propio rol')
  if (datos.correo) {
    datos.correo = datos.correo.toLowerCase()
    if (await Usuarios.existeCorreo(datos.correo, usuarioId)) throw conflicto('Ya existe un usuario con ese correo')
  }
  if ('rol' in datos || 'giro_id' in datos || 'sede_id' in datos) {
    const rol = datos.rol ?? actual.rol
    const cambiaGiro = 'giro_id' in datos && datos.giro_id !== actual.giro_id
    Object.assign(datos, await revisarAsignacion({
      rol,
      giro_id: datos.giro_id ?? actual.giro_id,
      sede_id: datos.sede_id ?? (cambiaGiro ? null : actual.sede_id)
    }))
  }
  if (datos.password) {
    datos.password_hash = await bcrypt.hash(String(datos.password), 10)
    delete datos.password
  }
  await Usuarios.actualizar(usuarioId, datos)
  ok(res, await Usuarios.buscar(usuarioId))
}

export async function cambiarEstado(req, res) {
  const usuarioId = id(req)
  const datos = validar(req.body, { activo: 'requerido|booleano' })
  const usuario = await Usuarios.buscar(usuarioId)
  if (!usuario) throw noEncontrado('Usuario')
  if (usuarioId === req.usuario.id && !datos.activo) throw prohibido('No puede desactivar su propia cuenta')
  await Usuarios.cambiarEstado(usuarioId, datos.activo)
  ok(res, await Usuarios.buscar(usuarioId))
}
