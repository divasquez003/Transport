import { creado, id, ok, paginacion, paginado } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import * as Comunicacion from '../models/comunicacion.js'
import * as ReunionService from '../services/reuniones.js'

export async function crear(req, res) {
  const reunion = await ReunionService.crear(req.usuario, req.body)
  creado(res, reunion, reunion.estado === 'confirmada' ? 'Reunión agendada' : 'Reunión solicitada')
}

// ?mias=1: las reuniones asignadas al vendedor que consulta
export async function listar(req, res) {
  const f = validar(req.query, { estado: `en:${Comunicacion.ESTADOS_REUNION}`, giro_id: 'entero', desde: 'fecha', mias: 'booleano' })
  if (f.mias && !req.usuario.cliente_id) f.vendedor_id = req.usuario.id
  const pag = paginacion(req.query)
  const [filas, total] = await Comunicacion.listarReuniones({ ...f, ...ReunionService.alcance(req.usuario) }, pag)
  paginado(res, filas, total, pag)
}

export async function ver(req, res) {
  ok(res, await ReunionService.obtener(req.usuario, id(req)))
}

export async function asignar(req, res) {
  ok(res, await ReunionService.asignar(req.usuario, id(req), req.body))
}

export async function cambiarEstado(req, res) {
  ok(res, await ReunionService.cambiarEstado(req.usuario, id(req), req.body))
}
