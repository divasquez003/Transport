import { creado, invalido, ok, paginacion, paginado, prohibido } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import { giroDe, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Inventario from '../models/inventario.js'
import * as InventarioService from '../services/inventario.js'

// Existencias por sede; el personal ve las de su giro. ?bajo_minimo=1 muestra lo que hay que reponer
export async function existencias(req, res) {
  const f = validar(req.query, { sede_id: 'entero', producto_id: 'entero', giro_id: 'entero', bajo_minimo: 'booleano' })
  f.giro_id = giroDe(req.usuario, f.giro_id)
  ok(res, await Inventario.existencias(f))
}

export async function crearMovimiento(req, res) {
  const datos = validar(req.body, {
    sede_id: 'requerido|entero',
    producto_id: 'requerido|entero',
    tipo: 'requerido|en:entrada,salida,ajuste',
    cantidad: 'requerido|numero|no_negativo|hasta:10000000',
    referencia: 'texto|max:60'
  })
  if (datos.tipo !== 'ajuste' && datos.cantidad <= 0) throw invalido({ cantidad: 'Debe ser mayor que cero' })
  const sede = await Catalogo.buscarSede(datos.sede_id)
  if (!sede?.giro_id) throw invalido({ sede_id: 'Debe ser una planta, sucursal o base de un giro' })
  if (!puedeVerGiro(req.usuario, sede.giro_id)) throw prohibido('Solo puede mover inventario de las sedes de su giro')
  const producto = await Catalogo.buscarProducto(datos.producto_id, true)
  if (!producto) throw invalido({ producto_id: 'El producto no existe' })
  if (!Catalogo.llevaInventario(producto)) throw invalido({ producto_id: 'Los servicios y alquileres no llevan inventario' })
  const resultado = await InventarioService.mover({
    sedeId: sede.id,
    productoId: producto.id,
    tipo: datos.tipo,
    cantidad: datos.cantidad,
    referencia: datos.referencia ?? `Movimiento manual (${req.usuario.nombre})`,
    usuarioId: req.usuario.id
  })
  creado(res, {
    sede_id: sede.id,
    sede: sede.nombre,
    producto_id: producto.id,
    producto: producto.nombre,
    tipo: datos.tipo,
    cantidad: datos.cantidad,
    existencia_anterior: resultado.anterior,
    existencia_nueva: resultado.nueva
  }, 'Movimiento registrado')
}

export async function movimientos(req, res) {
  const f = validar(req.query, {
    sede_id: 'entero',
    producto_id: 'entero',
    giro_id: 'entero',
    tipo: 'en:entrada,salida,ajuste',
    desde: 'fecha',
    hasta: 'fecha'
  })
  f.giro_id = giroDe(req.usuario, f.giro_id)
  const pag = paginacion(req.query, 30)
  const [filas, total] = await Inventario.movimientos(f, pag)
  paginado(res, filas, total, pag)
}
