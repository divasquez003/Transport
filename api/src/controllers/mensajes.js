import { creado, id, ok, paginacion, paginado } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import { esCliente } from '../middlewares/acceso.js'
import * as Comunicacion from '../models/comunicacion.js'
import * as MensajeService from '../services/mensajes.js'

// Bandeja de conversaciones con el último mensaje y los no leídos
export async function listar(req, res) {
  const f = validar(req.query, { estado: 'en:abierta,cerrada', giro_id: 'entero', cliente_id: 'entero' })
  const pag = paginacion(req.query)
  const [filas, total] = await Comunicacion.listarConversaciones({ ...f, ...MensajeService.alcance(req.usuario) }, esCliente(req.usuario), pag)
  paginado(res, filas, total, pag)
}

export async function crear(req, res) {
  creado(res, await MensajeService.crear(req.usuario, req.body), 'Conversación iniciada')
}

export async function mensajes(req, res) {
  ok(res, await MensajeService.ver(req.usuario, id(req)))
}

export async function responder(req, res) {
  creado(res, await MensajeService.responder(req.usuario, id(req), req.body), 'Mensaje enviado')
}
