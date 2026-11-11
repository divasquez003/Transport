import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { transaccion } from '../db.js'
import { HttpError, conflicto, creado, invalido, ok } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import * as Alertas from '../models/alertas.js'
import * as Clientes from '../models/clientes.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from '../services/alertas.js'

const sha256 = (texto) => createHash('sha256').update(texto).digest('hex')

function sesion(usuario) {
  const token = jwt.sign({ sub: usuario.id, rol: usuario.rol, nombre: usuario.nombre }, config.jwt.secreto, {
    algorithm: 'HS256',
    expiresIn: config.jwt.duracion
  })
  return {
    token,
    tipo: 'Bearer',
    expira_en: new Date(Date.now() + config.jwt.duracion * 1000).toISOString(),
    usuario
  }
}

export async function login(req, res) {
  const datos = validar(req.body, { correo: 'requerido|correo', password: 'requerido|texto' })
  const credenciales = await Usuarios.credenciales(datos.correo.toLowerCase())
  if (!credenciales || !(await bcrypt.compare(String(datos.password), credenciales.password_hash))) {
    throw new HttpError(401, 'Correo o contraseña incorrectos')
  }
  if (!credenciales.activo) throw new HttpError(403, 'La cuenta está desactivada; comuníquese con la empresa')
  await Usuarios.registrarAcceso(credenciales.id)
  ok(res, sesion(await Usuarios.sesion(credenciales.id)))
}

// Registro de clientes desde el sitio web
export async function registro(req, res) {
  const datos = validar(req.body, {
    nombre: 'requerido|texto|max:100',
    correo: 'requerido|correo|max:120',
    password: 'requerido|texto|min:8|max:72',
    telefono: 'texto|max:20',
    tipo: 'en:empresa,persona',
    empresa: 'texto|max:150',
    nit: 'texto|max:20',
    direccion: 'texto|max:200'
  })
  const tipo = datos.tipo ?? (datos.empresa ? 'empresa' : 'persona')
  if (tipo === 'empresa' && !datos.empresa) throw invalido({ empresa: 'Es obligatorio para clientes de tipo empresa' })
  const correo = datos.correo.toLowerCase()
  if (await Usuarios.existeCorreo(correo)) throw conflicto('Ya existe una cuenta con ese correo')
  const nit = datos.nit ? String(datos.nit).toUpperCase() : null
  if (nit && await Clientes.existeNit(nit)) throw conflicto('Ese NIT ya está registrado; pida a su empresa que solicite un usuario adicional')

  const passwordHash = await bcrypt.hash(String(datos.password), 10)
  const usuarioId = await transaccion(async () => {
    const nombreCliente = tipo === 'empresa' ? datos.empresa : datos.nombre
    const clienteId = await Clientes.crear({ tipo, nombre: nombreCliente, nit, correo, telefono: datos.telefono, direccion: datos.direccion })
    const id = await Usuarios.crear({ rol: 'cliente', cliente_id: clienteId, nombre: datos.nombre, correo, telefono: datos.telefono, password_hash: passwordHash })
    await AlertaService.enviar(await Usuarios.idsPorRol(['admin_general']), {
      tipo: 'cliente_nuevo',
      titulo: 'Nuevo cliente registrado',
      mensaje: `${nombreCliente} se registró en el portal de clientes.`,
      prioridad: 'baja',
      entidad: 'cliente',
      entidad_id: clienteId
    })
    return id
  })
  creado(res, sesion(await Usuarios.sesion(usuarioId)), 'Cuenta creada')
}

export async function perfil(req, res) {
  ok(res, { ...req.usuario, alertas_no_leidas: await Alertas.noLeidas(req.usuario.id) })
}

export async function cambiarPassword(req, res) {
  const datos = validar(req.body, { password_actual: 'requerido|texto', password_nueva: 'requerido|texto|min:8|max:72' })
  const hash = await Usuarios.passwordHash(req.usuario.id)
  if (!(await bcrypt.compare(String(datos.password_actual), hash))) {
    throw invalido({ password_actual: 'La contraseña actual no es correcta' })
  }
  if (datos.password_actual === datos.password_nueva) throw invalido({ password_nueva: 'Debe ser distinta de la actual' })
  await Usuarios.cambiarPassword(req.usuario.id, await bcrypt.hash(String(datos.password_nueva), 10))
  ok(res, { mensaje: 'Contraseña actualizada' })
}

// Genera un enlace de un solo uso válido 30 minutos. En producción se enviaría por correo;
// con APP_DEBUG=1 el token se devuelve en la respuesta para poder probar el flujo.
export async function recuperar(req, res) {
  const datos = validar(req.body, { correo: 'requerido|correo' })
  const credenciales = await Usuarios.credenciales(datos.correo.toLowerCase())
  const respuesta = { mensaje: 'Si el correo está registrado, recibirá un enlace para restablecer la contraseña' }
  if (credenciales?.activo) {
    const token = randomBytes(24).toString('hex')
    await Usuarios.guardarRecuperacion(credenciales.id, sha256(token))
    console.log(`[recuperar] enlace para ${datos.correo}: /recuperar?token=${token}`)
    if (config.debug) respuesta.token_desarrollo = token
  }
  ok(res, respuesta)
}

export async function restablecer(req, res) {
  const datos = validar(req.body, { token: 'requerido|texto|max:100', password_nueva: 'requerido|texto|min:8|max:72' })
  const usuario = await Usuarios.porRecuperacion(sha256(String(datos.token)))
  if (!usuario) throw new HttpError(400, 'El enlace no es válido o ya expiró; solicite uno nuevo')
  await Usuarios.cambiarPassword(usuario.id, await bcrypt.hash(String(datos.password_nueva), 10))
  ok(res, { mensaje: 'Contraseña restablecida; ya puede iniciar sesión' })
}
