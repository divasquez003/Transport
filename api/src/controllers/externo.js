import { creado, id, invalido, ok, paginacion, paginado } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import * as Catalogo from '../models/catalogo.js'
import * as Integraciones from '../models/integraciones.js'
import * as Pedidos from '../models/pedidos.js'
import * as PedidoService from '../services/pedidos.js'
import * as TransporteService from '../services/transporte.js'

// El sistema del cliente actúa como un usuario "integración" limitado a los datos de ese cliente
const comoUsuario = (integracion) => ({ id: null, rol: 'integracion', cliente_id: integracion.cliente_id, nombre: integracion.nombre })

export async function listarPedidos(req, res) {
  const f = validar(req.query, { estado: `en:${Pedidos.ESTADOS}`, desde: 'fecha', hasta: 'fecha' })
  const pag = paginacion(req.query)
  const [filas, total] = await Pedidos.listar({ ...f, cliente_id: req.integracion.cliente_id }, pag)
  paginado(res, filas, total, pag)
}

// Acepta producto_id o el código del producto: { "items": [{ "codigo": "MIN-001", "cantidad": 40 }] }
export async function crearPedido(req, res) {
  const integracion = req.integracion
  const cuerpo = req.body
  try {
    if (Array.isArray(cuerpo.items)) {
      cuerpo.items = await Promise.all(cuerpo.items.map(async (item) => {
        if (item?.producto_id || !item?.codigo) return item
        const producto = await Catalogo.productoPorCodigo(String(item.codigo).toUpperCase())
        if (!producto) throw invalido({ items: `El producto ${item.codigo} no existe` })
        return { producto_id: producto.id, cantidad: item.cantidad }
      }))
    }
    const pedido = await PedidoService.crear(comoUsuario(integracion), cuerpo)
    await Integraciones.bitacora({
      cliente_id: integracion.cliente_id, tipo: 'api_entrada', referencia: `POST /externo/pedidos ${pedido.codigo}`, estado: 'exitoso', detalle: integracion.nombre
    })
    creado(res, pedido, 'Pedido recibido')
  } catch (error) {
    await Integraciones.bitacora({
      cliente_id: integracion.cliente_id,
      tipo: 'api_entrada',
      referencia: 'POST /externo/pedidos',
      estado: 'fallido',
      detalle: error.errores ? `${error.message}: ${Object.values(error.errores).join('; ')}` : error.message
    })
    throw error
  }
}

// Seguimiento del viaje con la posición GPS (solo viajes del cliente dueño de la API key)
export async function verViaje(req, res) {
  const viaje = await TransporteService.obtener(null, id(req), { clienteId: req.integracion.cliente_id })
  const { piloto_id, piloto_telefono, pedido_giro_id, pedido_interno_solicitante_id, pedido_interno_proveedor_id, gps_dispositivo_id, ...publico } = await TransporteService.conSeguimiento(viaje)
  ok(res, publico)
}
