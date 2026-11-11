import bcrypt from 'bcryptjs'
import { transaccion } from '../db.js'
import { conflicto, creado, id, invalido, noEncontrado, ok, paginacion, paginado } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import { esCentral, esCliente } from '../middlewares/acceso.js'
import * as Clientes from '../models/clientes.js'
import * as Usuarios from '../models/usuarios.js'

export async function listar(req, res) {
  const f = validar(req.query, { buscar: 'texto|max:60', tipo: 'en:empresa,persona', activo: 'booleano' })
  const pag = paginacion(req.query)
  const [filas, total] = await Clientes.listar(f, pag)
  paginado(res, filas, total, pag)
}

// Ficha con el resumen del cliente frente a cada giro (el cliente solo puede ver la suya)
export async function ver(req, res) {
  const clienteId = id(req)
  if (esCliente(req.usuario) && req.usuario.cliente_id !== clienteId) throw noEncontrado('Cliente')
  const cliente = await Clientes.buscar(clienteId)
  if (!cliente) throw noEncontrado('Cliente')
  ok(res, cliente)
}

const REGLAS = {
  tipo: 'en:empresa,persona',
  nombre: 'texto|max:150',
  nit: 'texto|max:20',
  correo: 'correo|max:120',
  telefono: 'texto|max:20',
  direccion: 'texto|max:200',
  es_extranjero: 'booleano'
}

// El personal registra clientes que llegan a una sede; opcionalmente les crea acceso al portal
export async function crear(req, res) {
  const datos = validar(req.body, { ...REGLAS, nombre: 'requerido|texto|max:150', contacto: 'objeto' })
  if (datos.nit) {
    datos.nit = String(datos.nit).toUpperCase()
    if (await Clientes.existeNit(datos.nit)) throw conflicto('Ya existe un cliente con ese NIT')
  }
  let contacto = null
  if (datos.contacto) {
    contacto = validar(datos.contacto, { nombre: 'requerido|texto|max:100', correo: 'requerido|correo|max:120', password: 'requerido|texto|min:8|max:72' })
    contacto.correo = contacto.correo.toLowerCase()
    if (await Usuarios.existeCorreo(contacto.correo)) throw conflicto('Ya existe un usuario con el correo del contacto')
    contacto.password_hash = await bcrypt.hash(String(contacto.password), 10)
  }
  const clienteId = await transaccion(async () => {
    const nuevo = await Clientes.crear(datos)
    if (contacto) {
      await Usuarios.crear({ rol: 'cliente', cliente_id: nuevo, nombre: contacto.nombre, correo: contacto.correo, telefono: datos.telefono, password_hash: contacto.password_hash })
    }
    return nuevo
  })
  creado(res, await Clientes.buscar(clienteId), 'Cliente creado')
}

// El cliente puede actualizar sus datos de contacto; el personal, todos los datos
export async function actualizar(req, res) {
  const clienteId = id(req)
  const cliente = await Clientes.basico(clienteId)
  if (!cliente || (esCliente(req.usuario) && req.usuario.cliente_id !== clienteId)) throw noEncontrado('Cliente')
  const reglas = esCliente(req.usuario)
    ? { correo: REGLAS.correo, telefono: REGLAS.telefono, direccion: REGLAS.direccion }
    : { ...REGLAS, ...(esCentral(req.usuario) && { activo: 'booleano' }) }
  const datos = validar(req.body, reglas)
  if (!Object.keys(datos).length) throw invalido({}, 'Envíe al menos un campo para actualizar')
  if (datos.nit) {
    datos.nit = String(datos.nit).toUpperCase()
    if (await Clientes.existeNit(datos.nit, clienteId)) throw conflicto('Ya existe un cliente con ese NIT')
  }
  await Clientes.actualizar(clienteId, datos)
  ok(res, await Clientes.buscar(clienteId))
}
