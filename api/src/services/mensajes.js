import { transaccion } from '../db.js'
import { invalido, noEncontrado, prohibido } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import { esCentral, esCliente } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Clientes from '../models/clientes.js'
import * as Comunicacion from '../models/comunicacion.js'
import * as AlertaService from './alertas.js'

const resumen = (texto) => (texto.length > 120 ? `${texto.slice(0, 117)}...` : texto)

export function alcance(usuario) {
  if (esCliente(usuario)) return { cliente_id: usuario.cliente_id }
  return esCentral(usuario) ? {} : { giro_id: usuario.giro_id }
}

// Conversaciones sin giro (consultas generales) las atiende la sede central
export async function obtener(usuario, conversacionId) {
  const conversacion = await Comunicacion.buscarConversacion(conversacionId)
  if (!conversacion || (esCliente(usuario) && conversacion.cliente_id !== usuario.cliente_id)) throw noEncontrado('Conversación', 'a')
  if (!esCliente(usuario) && !esCentral(usuario) && conversacion.giro_id !== usuario.giro_id) {
    throw prohibido('La conversación pertenece a otro giro de negocio')
  }
  return conversacion
}

// Avisa a la otra parte: al cliente o al personal de ventas del giro
async function avisar(usuario, conversacion, contenido) {
  const alerta = {
    tipo: 'mensaje_nuevo',
    titulo: `Mensaje de ${usuario.nombre}`.slice(0, 150),
    mensaje: `${conversacion.asunto}: ${resumen(contenido)}`,
    entidad: 'conversacion',
    entidad_id: conversacion.id
  }
  if (!esCliente(usuario)) return AlertaService.aCliente(conversacion.cliente_id, alerta)
  if (conversacion.giro_id) return AlertaService.aGiro(conversacion.giro_id, ['gerente', 'vendedor'], alerta, usuario.id)
  return AlertaService.aCentral(alerta, usuario.id)
}

export async function crear(usuario, entrada) {
  const cliente = esCliente(usuario)
  const datos = validar(entrada, {
    cliente_id: cliente ? 'entero' : 'requerido|entero',
    giro_id: 'entero',
    asunto: 'requerido|texto|max:150',
    mensaje: 'requerido|texto|max:2000'
  })
  const clienteId = cliente ? usuario.cliente_id : datos.cliente_id
  const registro = await Clientes.basico(clienteId)
  if (!registro?.activo) throw invalido({ cliente_id: 'El cliente no existe o está inactivo' })
  // El personal de un giro escribe en nombre de su giro; el cliente elige a qué giro escribir
  let giroId = cliente || esCentral(usuario) ? datos.giro_id ?? null : usuario.giro_id
  if (giroId && !(await Catalogo.buscarGiro(giroId))) throw invalido({ giro_id: 'El giro de negocio no existe' })
  giroId ||= null

  return transaccion(async () => {
    const conversacionId = await Comunicacion.crearConversacion({ cliente_id: clienteId, giro_id: giroId, asunto: datos.asunto })
    await Comunicacion.agregarMensaje(conversacionId, usuario.id, datos.mensaje)
    const conversacion = await Comunicacion.buscarConversacion(conversacionId)
    await avisar(usuario, conversacion, datos.mensaje)
    return { ...conversacion, mensajes: await Comunicacion.mensajes(conversacionId) }
  })
}

// Al abrir la conversación se marcan como leídos los mensajes de la otra parte
export async function ver(usuario, conversacionId) {
  const conversacion = await obtener(usuario, conversacionId)
  await Comunicacion.marcarLeidos(conversacion.id, esCliente(usuario))
  return { ...conversacion, mensajes: await Comunicacion.mensajes(conversacion.id) }
}

// Responder reabre una conversación cerrada; el personal puede cerrarla con "cerrar": true
export async function responder(usuario, conversacionId, entrada) {
  const datos = validar(entrada, { contenido: 'requerido|texto|max:2000', cerrar: 'booleano' })
  const conversacion = await obtener(usuario, conversacionId)
  if (datos.cerrar && esCliente(usuario)) throw prohibido('Solo el personal de la empresa puede cerrar conversaciones')

  return transaccion(async () => {
    const mensajeId = await Comunicacion.agregarMensaje(conversacion.id, usuario.id, datos.contenido)
    const estado = datos.cerrar ? 'cerrada' : 'abierta'
    if (estado !== conversacion.estado) await Comunicacion.cambiarEstadoConversacion(conversacion.id, estado)
    await Comunicacion.marcarLeidos(conversacion.id, esCliente(usuario))
    await avisar(usuario, conversacion, datos.contenido)
    const mensajes = await Comunicacion.mensajes(conversacion.id)
    return { ...mensajes.find((m) => m.id === mensajeId), estado_conversacion: estado }
  })
}
