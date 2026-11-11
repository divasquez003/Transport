import { transaccion } from '../db.js'
import { conflicto, invalido, noEncontrado, prohibido } from '../lib/http.js'
import { ahora, estado as etiqueta } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { esCentral, esCliente, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Clientes from '../models/clientes.js'
import * as Gps from '../models/gps.js'
import * as Pedidos from '../models/pedidos.js'
import * as PedidosInternos from '../models/pedidosInternos.js'
import * as Transporte from '../models/transporte.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from './alertas.js'
import * as Webhooks from './webhooks.js'

// Rutas que atiende cada giro de transporte
const RUTAS_POR_GIRO = {
  TRANSP_MP: ['materia_prima', 'local'],
  TRANSP_PROD: ['inter_puertos', 'inter_fronteras', 'puerto_bodega', 'bodega_puerto', 'local']
}

const FLUJO = {
  programado: ['en_ruta', 'cancelado'],
  en_ruta: ['entregado'],
  entregado: [],
  cancelado: []
}

const ruta = (v) => `${v.origen} → ${v.destino}`

export async function crearViaje(usuario, entrada) {
  const datos = validar(entrada, {
    vehiculo_id: 'requerido|entero',
    piloto_id: 'entero',
    tipo_ruta: `requerido|en:${Transporte.TIPOS_RUTA}`,
    origen: 'requerido|texto|max:150',
    destino: 'requerido|texto|max:150',
    carga_descripcion: 'texto|max:200',
    peso_ton: 'numero|positivo|hasta:200',
    salida_programada: 'requerido|fechahora',
    tarifa: 'numero|no_negativo|hasta:9999999',
    cliente_id: 'entero',
    pedido_id: 'entero',
    pedido_interno_id: 'entero'
  })
  const vehiculo = await Transporte.buscarVehiculo(datos.vehiculo_id)
  if (!vehiculo) throw invalido({ vehiculo_id: 'El vehículo no existe' })
  if (!puedeVerGiro(usuario, vehiculo.giro_id)) throw prohibido('Solo puede programar viajes con vehículos de su giro')
  if (['mantenimiento', 'inactivo'].includes(vehiculo.estado)) throw conflicto(`El vehículo ${vehiculo.placa} está ${etiqueta(vehiculo.estado)}`)
  if (datos.peso_ton && vehiculo.capacidad_ton && datos.peso_ton > vehiculo.capacidad_ton) {
    throw invalido({ peso_ton: `Supera la capacidad del vehículo (${vehiculo.capacidad_ton} t)` })
  }
  const giro = await Catalogo.buscarGiro(vehiculo.giro_id)
  const rutas = RUTAS_POR_GIRO[giro.codigo]
  if (rutas && !rutas.includes(datos.tipo_ruta)) throw invalido({ tipo_ruta: `${giro.nombre} atiende rutas: ${rutas.join(', ')}` })
  if (datos.salida_programada < ahora().slice(0, 10)) throw invalido({ salida_programada: 'No puede ser una fecha pasada' })

  if (datos.piloto_id) {
    const piloto = await Usuarios.buscarPersonal(datos.piloto_id)
    if (!piloto?.activo || piloto.rol !== 'operativo' || piloto.giro_id !== vehiculo.giro_id) {
      throw invalido({ piloto_id: `Debe ser personal operativo activo de ${giro.nombre}` })
    }
  }
  // El viaje puede atender el pedido de un cliente o un pedido entre giros
  let clienteId = datos.cliente_id ?? null
  if (datos.pedido_id) {
    const pedido = await Pedidos.buscar(datos.pedido_id)
    if (!pedido || ['entregado', 'cancelado'].includes(pedido.estado)) throw invalido({ pedido_id: 'El pedido no existe o ya está cerrado' })
    if (clienteId && clienteId !== pedido.cliente_id) throw invalido({ cliente_id: 'No coincide con el cliente del pedido' })
    clienteId = pedido.cliente_id
  }
  if (datos.pedido_interno_id) {
    const interno = await PedidosInternos.buscar(datos.pedido_interno_id)
    if (!interno || !['aprobado', 'en_transito'].includes(interno.estado)) {
      throw invalido({ pedido_interno_id: 'El pedido interno no existe o no está aprobado' })
    }
  }
  if (clienteId) {
    const cliente = await Clientes.basico(clienteId)
    if (!cliente?.activo) throw invalido({ cliente_id: 'El cliente no existe o está inactivo' })
  }

  return transaccion(async () => {
    const viajeId = await Transporte.crearViaje({ ...datos, giro_id: vehiculo.giro_id, cliente_id: clienteId })
    const viaje = await Transporte.buscarViaje(viajeId)
    const salida = viaje.salida_programada.slice(0, 16)
    if (viaje.piloto_id) {
      await AlertaService.enviar([viaje.piloto_id], {
        tipo: 'viaje_asignado',
        titulo: `Viaje ${viaje.codigo} asignado`,
        mensaje: `${ruta(viaje)}, salida ${salida} en ${viaje.placa}.${viaje.carga_descripcion ? ` Carga: ${viaje.carga_descripcion}.` : ''}`,
        entidad: 'viaje',
        entidad_id: viajeId
      }, usuario.id)
    }
    await AlertaService.aCliente(clienteId, {
      tipo: 'viaje_programado',
      titulo: `Viaje ${viaje.codigo} programado`,
      mensaje: `${ruta(viaje)}, salida ${salida}. Puede seguirlo en línea cuando esté en ruta.`,
      entidad: 'viaje',
      entidad_id: viajeId
    })
    return viaje
  })
}

// Personal: viajes de su giro o de los pedidos de su giro. Cliente: los suyos
export function alcance(usuario) {
  if (esCliente(usuario)) return { cliente_id: usuario.cliente_id }
  return esCentral(usuario) ? {} : { giro_id: usuario.giro_id }
}

function participa(usuario, viaje) {
  if (esCentral(usuario)) return true
  return [viaje.giro_id, viaje.pedido_giro_id, viaje.pedido_interno_solicitante_id, viaje.pedido_interno_proveedor_id]
    .some((giro) => giro && giro === usuario.giro_id)
}

// Detalle del viaje con la última posición y el recorrido del GPS
export async function obtener(usuario, viajeId, { clienteId } = {}) {
  const viaje = await Transporte.buscarViaje(viajeId)
  const propio = clienteId ?? (esCliente(usuario) ? usuario.cliente_id : null)
  if (!viaje || (propio && viaje.cliente_id !== propio)) throw noEncontrado('Viaje')
  if (!propio && !participa(usuario, viaje)) throw prohibido('El viaje pertenece a otro giro de negocio')
  return viaje
}

export async function conSeguimiento(viaje) {
  const gps = viaje.gps_dispositivo_id ? await Gps.buscarDispositivo(viaje.gps_dispositivo_id) : null
  viaje.posicion = gps?.registrado_en
    ? { latitud: gps.latitud, longitud: gps.longitud, velocidad_kmh: gps.velocidad_kmh, registrado_en: gps.registrado_en }
    : null
  viaje.recorrido = gps && viaje.salida_real
    ? await Gps.recorrido(gps.id, viaje.salida_real, viaje.llegada_real ?? ahora())
    : []
  return viaje
}

export async function cambiarEstadoViaje(usuario, viajeId, entrada) {
  const datos = validar(entrada, { estado: `requerido|en:${Transporte.ESTADOS_VIAJE}`, comentario: 'texto|max:255' })
  const viaje = await obtener(usuario, viajeId)
  const actual = viaje.estado
  const nuevo = datos.estado
  if (!FLUJO[actual].includes(nuevo)) {
    const opciones = FLUJO[actual].join(', ') || 'ninguno (estado final)'
    throw conflicto(`No se puede pasar de '${actual}' a '${nuevo}'. Estados permitidos: ${opciones}`)
  }
  // Solo el giro de transporte opera el viaje; el piloto, únicamente los suyos
  if (!puedeVerGiro(usuario, viaje.giro_id)) throw prohibido('Solo el giro de transporte puede actualizar el viaje')
  if (usuario.rol === 'operativo' && viaje.piloto_id !== usuario.id) throw prohibido('Solo el piloto asignado puede actualizar este viaje')
  if (nuevo === 'cancelado' && !datos.comentario) throw invalido({ comentario: 'Indique el motivo de la cancelación' })

  await transaccion(async () => {
    const momento = ahora()
    if (nuevo === 'en_ruta') {
      const vehiculo = await Transporte.buscarVehiculo(viaje.vehiculo_id)
      if (['mantenimiento', 'inactivo'].includes(vehiculo.estado)) throw conflicto(`El vehículo ${vehiculo.placa} está ${etiqueta(vehiculo.estado)}`)
      const enCurso = await Transporte.viajeEnRutaDe(viaje.vehiculo_id)
      if (enCurso) throw conflicto(`El vehículo ${viaje.placa} ya está en ruta con el viaje ${enCurso.codigo}`)
      await Transporte.actualizarVehiculo(viaje.vehiculo_id, { estado: 'en_ruta' })
      await Transporte.actualizarViaje(viaje.id, { estado: nuevo, salida_real: momento })
    } else if (nuevo === 'entregado') {
      await Transporte.actualizarVehiculo(viaje.vehiculo_id, { estado: 'disponible' })
      await Transporte.actualizarViaje(viaje.id, { estado: nuevo, llegada_real: momento })
      // Si el viaje llevaba un pedido ya despachado, el pedido queda entregado
      const pedido = viaje.pedido_id ? await Pedidos.buscar(viaje.pedido_id) : null
      if (pedido?.estado === 'despachado') {
        await Pedidos.cambiarEstado(pedido.id, 'entregado')
        await Pedidos.registrarHistorial(pedido.id, 'despachado', 'entregado', usuario.id, `Entregado con el viaje ${viaje.codigo}`)
      }
    } else {
      await Transporte.actualizarViaje(viaje.id, { estado: nuevo })
    }

    const textos = {
      en_ruta: `Salió a las ${momento.slice(11, 16)}: ${ruta(viaje)}. Puede seguirlo en el mapa.`,
      entregado: `La carga llegó a ${viaje.destino} a las ${momento.slice(11, 16)}.`,
      cancelado: `Se canceló el viaje ${ruta(viaje)}. ${datos.comentario ?? ''}`.trim()
    }
    const alerta = {
      tipo: `viaje_${nuevo}`,
      titulo: `Viaje ${viaje.codigo}: ${etiqueta(nuevo)}`,
      mensaje: textos[nuevo],
      prioridad: nuevo === 'cancelado' ? 'alta' : 'media',
      entidad: 'viaje',
      entidad_id: viaje.id
    }
    await AlertaService.aCliente(viaje.cliente_id, alerta)
    // Pedido entre giros: se avisa a quien lo solicitó
    if (viaje.pedido_interno_solicitante_id) {
      await AlertaService.aGiro(viaje.pedido_interno_solicitante_id, ['gerente', 'administrativo'], alerta, usuario.id)
    }
    if (usuario.rol === 'operativo') await AlertaService.aGiro(viaje.giro_id, ['gerente'], alerta, usuario.id)
    if (nuevo === 'entregado') {
      Webhooks.emitir(viaje.cliente_id, 'viaje.entregado', {
        id: viaje.id, codigo: viaje.codigo, origen: viaje.origen, destino: viaje.destino, pedido: viaje.pedido, llegada_real: momento
      })
    }
  })
  return Transporte.buscarViaje(viaje.id)
}
