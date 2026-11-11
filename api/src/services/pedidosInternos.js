import { transaccion } from '../db.js'
import { conflicto, invalido, noEncontrado, prohibido } from '../lib/http.js'
import { conUnidad, estado as etiqueta, hoy, redondear } from '../lib/formato.js'
import { validar, validarItems } from '../lib/validar.js'
import { CENTRAL, esCentral, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as PedidosInternos from '../models/pedidosInternos.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from './alertas.js'
import * as InventarioService from './inventario.js'

// estado actual => { estado siguiente: lado que puede hacer el cambio }
const FLUJO = {
  solicitado: { aprobado: 'proveedor', rechazado: 'proveedor', cancelado: 'solicitante' },
  aprobado: { en_transito: 'proveedor', cancelado: 'solicitante' },
  en_transito: { recibido: 'solicitante' },
  recibido: {},
  rechazado: {},
  cancelado: {}
}

export async function crear(usuario, entrada) {
  const datos = validar(entrada, {
    giro_proveedor_id: 'requerido|entero',
    sede_solicitante_id: 'entero',
    sede_proveedora_id: 'entero',
    fecha_requerida: 'requerido|fecha',
    prioridad: `en:${PedidosInternos.PRIORIDADES}`,
    observaciones: 'texto|max:500',
    items: 'requerido|arreglo'
  })
  const items = validarItems(datos.items)

  // Por defecto pide la sede del usuario (por ejemplo, la gerente de la Planta Zacapa)
  const sedeSolicitante = await Catalogo.buscarSede(datos.sede_solicitante_id ?? usuario.sede_id ?? 0)
  if (!sedeSolicitante?.giro_id) throw invalido({ sede_solicitante_id: 'Indique la planta o sucursal que hace el pedido' })
  const giroSolicitante = sedeSolicitante.giro_id
  if (!puedeVerGiro(usuario, giroSolicitante)) throw prohibido('Solo puede hacer pedidos internos para sedes de su giro de negocio')

  const giroProveedor = datos.giro_proveedor_id
  const proveedor = await Catalogo.buscarGiro(giroProveedor)
  if (!proveedor) throw invalido({ giro_proveedor_id: 'El giro proveedor no existe' })
  if (giroProveedor === giroSolicitante) throw invalido({ giro_proveedor_id: 'Debe ser un giro distinto al que solicita' })

  let sedeProveedora = null
  if (datos.sede_proveedora_id) {
    const sede = await Catalogo.buscarSede(datos.sede_proveedora_id)
    if (sede?.giro_id !== giroProveedor) throw invalido({ sede_proveedora_id: `La sede no pertenece a ${proveedor.nombre}` })
    sedeProveedora = sede.id
  }
  if (datos.fecha_requerida < hoy()) throw invalido({ fecha_requerida: 'No puede ser una fecha pasada' })

  const productos = await Catalogo.productosPorIds([...items.keys()])
  const detalle = [...items].map(([productoId, valor]) => {
    const producto = productos.get(productoId)
    if (!producto?.activo || producto.giro_id !== giroProveedor) {
      throw invalido({ items: `El producto ${productoId} no existe o no pertenece a ${proveedor.nombre}` })
    }
    const costo = Number(producto.precio)
    return { producto_id: productoId, cantidad: valor, costo_unitario: costo, subtotal: redondear(costo * valor) }
  })
  const prioridad = datos.prioridad ?? 'media'

  return transaccion(async () => {
    const pedidoId = await PedidosInternos.crear({
      giro_solicitante_id: giroSolicitante,
      sede_solicitante_id: sedeSolicitante.id,
      giro_proveedor_id: giroProveedor,
      sede_proveedora_id: sedeProveedora,
      solicitado_por: usuario.id,
      prioridad,
      fecha_requerida: datos.fecha_requerida,
      total: redondear(detalle.reduce((s, l) => s + l.subtotal, 0)),
      observaciones: datos.observaciones
    }, detalle)
    await PedidosInternos.registrarHistorial(pedidoId, null, 'solicitado', usuario.id, null)
    const pedido = await PedidosInternos.buscar(pedidoId)

    const resumen = pedido.detalle.map((d) => `${conUnidad(d.cantidad, d.unidad_medida)} de ${d.producto}`).join(', ')
    let destinatarios = await Usuarios.idsPorGiro(giroProveedor, ['gerente', 'administrativo'])
    if (prioridad === 'urgente') destinatarios = destinatarios.concat(await Usuarios.idsPorRol(CENTRAL))
    await AlertaService.enviar(destinatarios, {
      tipo: 'pedido_interno_nuevo',
      titulo: `Pedido interno ${pedido.codigo} (prioridad ${prioridad})`,
      mensaje: `${pedido.sede_solicitante} solicita ${resumen} para el ${pedido.fecha_requerida}.`,
      prioridad: ['alta', 'urgente'].includes(prioridad) ? 'alta' : 'media',
      entidad: 'pedido_interno',
      entidad_id: pedidoId
    }, usuario.id)
    return pedido
  })
}

export async function obtener(usuario, pedidoId) {
  const pedido = await PedidosInternos.buscar(pedidoId)
  if (!pedido) throw noEncontrado('Pedido interno')
  const participa = [pedido.giro_solicitante_id, pedido.giro_proveedor_id].includes(usuario.giro_id)
  if (!esCentral(usuario) && !participa) throw prohibido('Su giro no participa en este pedido interno')
  return pedido
}

export async function cambiarEstado(usuario, pedidoId, entrada) {
  const datos = validar(entrada, {
    estado: `requerido|en:${PedidosInternos.ESTADOS}`,
    comentario: 'texto|max:255',
    sede_proveedora_id: 'entero'
  })
  const pedido = await obtener(usuario, pedidoId)
  const actual = pedido.estado
  const nuevo = datos.estado
  const siguientes = FLUJO[actual]
  if (!siguientes[nuevo]) {
    const opciones = Object.keys(siguientes).join(', ') || 'ninguno (estado final)'
    throw conflicto(`No se puede pasar de '${actual}' a '${nuevo}'. Estados permitidos: ${opciones}`)
  }
  const lado = siguientes[nuevo]
  const giroDelLado = lado === 'proveedor' ? pedido.giro_proveedor_id : pedido.giro_solicitante_id
  if (!puedeVerGiro(usuario, giroDelLado)) {
    const nombre = lado === 'proveedor' ? pedido.giro_proveedor : pedido.giro_solicitante
    throw prohibido(`Solo el giro ${lado} (${nombre}) puede marcar el pedido como '${nuevo}'`)
  }
  const comentario = datos.comentario ?? null
  if (['rechazado', 'cancelado'].includes(nuevo) && !comentario) throw invalido({ comentario: 'Indique el motivo' })

  // Inventario: sale de la sede proveedora al despachar y entra a la sede solicitante al recibir
  const fisicos = pedido.detalle.filter(Catalogo.llevaInventario)
  let sedeProveedora = pedido.sede_proveedora_id
  if (nuevo === 'en_transito' && fisicos.length) {
    sedeProveedora = datos.sede_proveedora_id ?? sedeProveedora
    if (!sedeProveedora) throw invalido({ sede_proveedora_id: 'Indique la sede que despacha' })
    const sede = await Catalogo.buscarSede(sedeProveedora)
    if (sede?.giro_id !== pedido.giro_proveedor_id) throw invalido({ sede_proveedora_id: `La sede no pertenece a ${pedido.giro_proveedor}` })
  }

  await transaccion(async () => {
    if (nuevo === 'en_transito' || nuevo === 'recibido') {
      for (const linea of fisicos) {
        await InventarioService.mover({
          sedeId: nuevo === 'en_transito' ? sedeProveedora : pedido.sede_solicitante_id,
          productoId: linea.producto_id,
          tipo: nuevo === 'en_transito' ? 'salida' : 'entrada',
          cantidad: linea.cantidad,
          referencia: pedido.codigo,
          usuarioId: usuario.id
        })
      }
    }
    await PedidosInternos.cambiarEstado(pedido.id, nuevo, {
      atendidoPor: ['aprobado', 'rechazado'].includes(nuevo) ? usuario.id : null,
      sedeProveedora: nuevo === 'en_transito' ? sedeProveedora : null
    })
    await PedidosInternos.registrarHistorial(pedido.id, actual, nuevo, usuario.id, comentario)

    // Se avisa al otro lado del pedido
    const destinatarios = lado === 'proveedor'
      ? [pedido.solicitado_por, ...await Usuarios.idsPorGiro(pedido.giro_solicitante_id, ['gerente'])]
      : await Usuarios.idsPorGiro(pedido.giro_proveedor_id, ['gerente', 'administrativo'])
    await AlertaService.enviar(destinatarios, {
      tipo: 'pedido_interno_estado',
      titulo: `Pedido interno ${pedido.codigo}: ${etiqueta(nuevo)}`,
      mensaje: `${usuario.nombre} (${usuario.giro ?? 'Sede central'}) cambió el estado de ${etiqueta(actual)} a ${etiqueta(nuevo)}${comentario ? `. ${comentario}` : '.'}`,
      prioridad: ['rechazado', 'cancelado'].includes(nuevo) ? 'alta' : 'media',
      entidad: 'pedido_interno',
      entidad_id: pedido.id
    }, usuario.id)
  })
  return PedidosInternos.buscar(pedido.id)
}
