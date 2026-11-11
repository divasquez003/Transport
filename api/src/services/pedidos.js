import { transaccion } from '../db.js'
import { conflicto, invalido, noEncontrado, prohibido } from '../lib/http.js'
import { estado as etiqueta, hoy, quetzales, redondear } from '../lib/formato.js'
import { validar, validarItems } from '../lib/validar.js'
import { esCentral, esCliente, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Clientes from '../models/clientes.js'
import * as Pedidos from '../models/pedidos.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from './alertas.js'
import * as InventarioService from './inventario.js'
import * as Webhooks from './webhooks.js'

// Estados a los que puede pasar un pedido desde cada estado
const FLUJO = {
  pendiente: ['confirmado', 'cancelado'],
  confirmado: ['en_proceso', 'cancelado'],
  en_proceso: ['despachado', 'cancelado'],
  despachado: ['entregado'],
  entregado: [],
  cancelado: []
}

// Pedidos que hace el propio cliente: desde el portal o desde su sistema (integración con API key)
const esDelCliente = (usuario) => esCliente(usuario) || usuario.rol === 'integracion'

const resumenWebhook = (p) => ({ id: p.id, codigo: p.codigo, estado: p.estado, total: p.total, giro: p.giro, actualizado_en: p.actualizado_en ?? p.creado_en })

export async function crear(usuario, entrada) {
  const delCliente = esDelCliente(usuario)
  const datos = validar(entrada, {
    cliente_id: delCliente ? 'entero' : 'requerido|entero',
    items: 'requerido|arreglo',
    sede_id: 'entero',
    direccion_entrega: 'texto|max:200',
    fecha_entrega: 'fecha',
    observaciones: 'texto|max:500'
  })
  const items = validarItems(datos.items)
  const clienteId = delCliente ? usuario.cliente_id : datos.cliente_id
  const cliente = await Clientes.basico(clienteId)
  if (!cliente?.activo) throw invalido({ cliente_id: 'El cliente no existe o está inactivo' })

  const productos = await Catalogo.productosPorIds([...items.keys()])
  for (const productoId of items.keys()) {
    const producto = productos.get(productoId)
    if (!producto?.activo) throw invalido({ items: `El producto ${productoId} no existe o no está disponible` })
    if (producto.modalidad_venta === 'cotizacion') {
      const mensaje = `"${producto.nombre}" se vende por cotización: agende una reunión con un vendedor (POST /api/reuniones)`
      throw invalido({ items: mensaje }, mensaje)
    }
    if (producto.tipo === 'alquiler') {
      const mensaje = `"${producto.nombre}" es un alquiler: reserve una máquina disponible (POST /api/alquileres)`
      throw invalido({ items: mensaje }, mensaje)
    }
  }
  // Cada giro lleva su propio control: un pedido = un giro
  const giros = new Set([...productos.values()].map((p) => p.giro_id))
  if (giros.size > 1) {
    const mensaje = 'Todos los productos de un pedido deben ser del mismo giro de negocio; haga un pedido por cada giro'
    throw invalido({ items: mensaje }, mensaje)
  }
  const [giroId] = giros
  if (!delCliente && !puedeVerGiro(usuario, giroId)) throw prohibido('Solo puede registrar pedidos de su giro de negocio')

  let sedeId = null
  if (datos.sede_id) {
    const sede = await Catalogo.buscarSede(datos.sede_id)
    if (sede?.giro_id !== giroId) throw invalido({ sede_id: 'La sede no pertenece al giro de los productos' })
    sedeId = sede.id
  }
  if (datos.fecha_entrega && datos.fecha_entrega < hoy()) throw invalido({ fecha_entrega: 'No puede ser una fecha pasada' })

  const detalle = [...items].map(([productoId, cantidad]) => {
    const precio = Number(productos.get(productoId).precio)
    return { producto_id: productoId, cantidad, precio_unitario: precio, subtotal: redondear(precio * cantidad) }
  })
  const total = redondear(detalle.reduce((suma, l) => suma + l.subtotal, 0))

  return transaccion(async () => {
    const pedidoId = await Pedidos.crear({
      cliente_id: clienteId,
      giro_id: giroId,
      sede_id: sedeId,
      vendedor_id: usuario.rol === 'vendedor' ? usuario.id : null,
      total,
      direccion_entrega: datos.direccion_entrega,
      fecha_entrega: datos.fecha_entrega,
      observaciones: datos.observaciones,
      creado_por: usuario.id
    }, detalle)
    const origen = esCliente(usuario) ? 'Pedido creado en línea' : `Pedido registrado por ${usuario.nombre}`
    await Pedidos.registrarHistorial(pedidoId, null, 'pendiente', usuario.id, origen)
    const pedido = await Pedidos.buscar(pedidoId)

    const monto = quetzales(total)
    await AlertaService.aGiro(giroId, ['gerente', 'vendedor'], {
      tipo: 'pedido_nuevo',
      titulo: `Nuevo pedido ${pedido.codigo}`,
      mensaje: `${cliente.nombre} hizo un pedido por ${monto}.`,
      entidad: 'pedido',
      entidad_id: pedidoId
    }, usuario.id)
    if (!esCliente(usuario)) {
      await AlertaService.aCliente(clienteId, {
        tipo: 'pedido_nuevo',
        titulo: `Pedido ${pedido.codigo} registrado`,
        mensaje: `${usuario.nombre} registró un pedido a su nombre por ${monto}.`,
        entidad: 'pedido',
        entidad_id: pedidoId
      })
    }
    Webhooks.emitir(clienteId, 'pedido.creado', resumenWebhook(pedido))
    return pedido
  })
}

// Lo que cada rol puede ver en los listados
export function alcance(usuario) {
  if (esDelCliente(usuario)) return { cliente_id: usuario.cliente_id }
  if (esCentral(usuario)) return {}
  return { giro_id: usuario.giro_id }
}

export async function obtener(usuario, pedidoId) {
  const pedido = await Pedidos.buscar(pedidoId)
  if (!pedido || (esDelCliente(usuario) && pedido.cliente_id !== usuario.cliente_id)) throw noEncontrado('Pedido')
  if (!esDelCliente(usuario) && !puedeVerGiro(usuario, pedido.giro_id)) throw prohibido('El pedido pertenece a otro giro de negocio')
  return pedido
}

export async function cambiarEstado(usuario, pedidoId, entrada) {
  const datos = validar(entrada, { estado: `requerido|en:${Pedidos.ESTADOS}`, comentario: 'texto|max:255', sede_id: 'entero' })
  const pedido = await obtener(usuario, pedidoId)
  const actual = pedido.estado
  const nuevo = datos.estado

  if (nuevo === actual) throw conflicto(`El pedido ya está en estado '${actual}'`)
  if (!FLUJO[actual].includes(nuevo)) {
    const siguientes = FLUJO[actual].length ? FLUJO[actual].join(', ') : 'ninguno (estado final)'
    throw conflicto(`No se puede pasar de '${actual}' a '${nuevo}'. Estados permitidos: ${siguientes}`)
  }
  if (esCliente(usuario) && !(actual === 'pendiente' && nuevo === 'cancelado')) {
    throw prohibido('El cliente solo puede cancelar pedidos que aún están pendientes')
  }
  const comentario = datos.comentario ?? null
  if (nuevo === 'cancelado' && !comentario) throw invalido({ comentario: 'Indique el motivo de la cancelación' })

  // Al despachar sale la mercadería de la sede: se descuenta del inventario
  let sedeId = null
  const fisicos = pedido.detalle.filter(Catalogo.llevaInventario)
  if (nuevo === 'despachado' && fisicos.length) {
    sedeId = datos.sede_id ?? pedido.sede_id
    if (!sedeId) throw invalido({ sede_id: 'Indique la sede que despacha el pedido' })
    const sede = await Catalogo.buscarSede(sedeId)
    if (sede?.giro_id !== pedido.giro_id) throw invalido({ sede_id: 'La sede no pertenece al giro del pedido' })
  }

  await transaccion(async () => {
    for (const linea of nuevo === 'despachado' ? fisicos : []) {
      await InventarioService.mover({
        sedeId,
        productoId: linea.producto_id,
        tipo: 'salida',
        cantidad: linea.cantidad,
        referencia: pedido.codigo,
        usuarioId: usuario.id
      })
    }
    await Pedidos.cambiarEstado(pedido.id, nuevo, sedeId)
    await Pedidos.registrarHistorial(pedido.id, actual, nuevo, usuario.id, comentario)

    await AlertaService.aCliente(pedido.cliente_id, {
      tipo: 'pedido_estado',
      titulo: `Pedido ${pedido.codigo}: ${etiqueta(nuevo)}`,
      mensaje: `Su pedido cambió de ${etiqueta(actual)} a ${etiqueta(nuevo)}${comentario ? `. ${comentario}` : '.'}`,
      prioridad: nuevo === 'cancelado' ? 'alta' : 'media',
      entidad: 'pedido',
      entidad_id: pedido.id
    }, usuario.id)

    if (esCliente(usuario)) {
      const personal = await Usuarios.idsPorGiro(pedido.giro_id, ['gerente'])
      if (pedido.vendedor_id) personal.push(pedido.vendedor_id)
      await AlertaService.enviar(personal, {
        tipo: 'pedido_cancelado',
        titulo: `${pedido.codigo} cancelado por el cliente`,
        mensaje: `${pedido.cliente}: ${comentario}`,
        prioridad: 'alta',
        entidad: 'pedido',
        entidad_id: pedido.id
      })
    }
    Webhooks.emitir(pedido.cliente_id, 'pedido.estado_cambiado', { ...resumenWebhook(pedido), estado: nuevo, estado_anterior: actual })
  })
  return Pedidos.buscar(pedido.id)
}

export async function asignarVendedor(usuario, pedidoId, entrada) {
  const datos = validar(entrada, { vendedor_id: 'requerido|entero' })
  const pedido = await obtener(usuario, pedidoId)
  if (['entregado', 'cancelado'].includes(pedido.estado)) throw conflicto(`No se puede asignar vendedor a un pedido ${pedido.estado}`)
  const vendedor = await Usuarios.buscarPersonal(datos.vendedor_id)
  if (!vendedor?.activo || vendedor.rol !== 'vendedor' || vendedor.giro_id !== pedido.giro_id) {
    throw invalido({ vendedor_id: `Debe ser un vendedor activo de ${pedido.giro}` })
  }
  if (pedido.vendedor_id === vendedor.id) throw conflicto(`${vendedor.nombre} ya tiene asignado este pedido`)

  await transaccion(async () => {
    await Pedidos.asignarVendedor(pedido.id, vendedor.id)
    await Pedidos.registrarHistorial(pedido.id, pedido.estado, pedido.estado, usuario.id, `Vendedor asignado: ${vendedor.nombre}`)
    await AlertaService.enviar([vendedor.id], {
      tipo: 'pedido_asignado',
      titulo: `Se le asignó el pedido ${pedido.codigo}`,
      mensaje: `${pedido.cliente}, pedido por ${quetzales(pedido.total)} (estado: ${etiqueta(pedido.estado)}).`,
      entidad: 'pedido',
      entidad_id: pedido.id
    }, usuario.id)
    await AlertaService.aCliente(pedido.cliente_id, {
      tipo: 'pedido_vendedor',
      titulo: `Vendedor asignado al pedido ${pedido.codigo}`,
      mensaje: `${vendedor.nombre} (${vendedor.correo}, tel. ${vendedor.telefono}) atenderá su pedido.`,
      entidad: 'pedido',
      entidad_id: pedido.id
    })
  })
  return Pedidos.buscar(pedido.id)
}
