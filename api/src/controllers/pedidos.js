import { creado, id, ok, paginacion, paginado } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import * as Pedidos from '../models/pedidos.js'
import * as PedidoService from '../services/pedidos.js'

export async function crear(req, res) {
  creado(res, await PedidoService.crear(req.usuario, req.body), 'Pedido registrado')
}

// El cliente ve sus pedidos, el personal los de su giro y la sede central todos
export async function listar(req, res) {
  const f = validar(req.query, {
    estado: `en:${Pedidos.ESTADOS}`,
    giro_id: 'entero',
    cliente_id: 'entero',
    vendedor_id: 'entero',
    mios: 'booleano',
    desde: 'fecha',
    hasta: 'fecha',
    buscar: 'texto|max:60'
  })
  // ?mios=1: los pedidos asignados al vendedor que consulta
  if (f.mios && !req.usuario.cliente_id) f.vendedor_id = req.usuario.id
  const pag = paginacion(req.query)
  const [filas, total] = await Pedidos.listar({ ...f, ...PedidoService.alcance(req.usuario) }, pag)
  paginado(res, filas, total, pag)
}

export async function ver(req, res) {
  ok(res, await PedidoService.obtener(req.usuario, id(req)))
}

export async function cambiarEstado(req, res) {
  ok(res, await PedidoService.cambiarEstado(req.usuario, id(req), req.body))
}

export async function asignarVendedor(req, res) {
  ok(res, await PedidoService.asignarVendedor(req.usuario, id(req), req.body))
}
