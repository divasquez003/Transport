import { creado, id, ok, paginacion, paginado } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import { giroDe } from '../middlewares/acceso.js'
import * as PedidosInternos from '../models/pedidosInternos.js'
import * as PedidoInternoService from '../services/pedidosInternos.js'

export async function crear(req, res) {
  creado(res, await PedidoInternoService.crear(req.usuario, req.body), 'Pedido interno registrado')
}

// Cada giro ve los pedidos en los que participa; ?rol=solicitante|proveedor filtra el lado
export async function listar(req, res) {
  const f = validar(req.query, {
    estado: `en:${PedidosInternos.ESTADOS}`,
    prioridad: `en:${PedidosInternos.PRIORIDADES}`,
    rol: 'en:solicitante,proveedor',
    giro_id: 'entero'
  })
  const pag = paginacion(req.query)
  const [filas, total] = await PedidosInternos.listar(f, giroDe(req.usuario, f.giro_id), pag)
  paginado(res, filas, total, pag)
}

export async function ver(req, res) {
  ok(res, await PedidoInternoService.obtener(req.usuario, id(req)))
}

export async function cambiarEstado(req, res) {
  ok(res, await PedidoInternoService.cambiarEstado(req.usuario, id(req), req.body))
}
