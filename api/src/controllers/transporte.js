import { conflicto, creado, id, invalido, noEncontrado, ok, paginacion, paginado, prohibido } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import { esCentral, giroDe, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Gps from '../models/gps.js'
import * as Transporte from '../models/transporte.js'
import * as TransporteService from '../services/transporte.js'

// ------------------------------------------------------------------ vehículos (flota con GPS)

export async function listarVehiculos(req, res) {
  const f = validar(req.query, { giro_id: 'entero', estado: `en:${Transporte.ESTADOS_VEHICULO}` })
  ok(res, await Transporte.listarVehiculos({ ...f, giro_id: giroDe(req.usuario, f.giro_id) }))
}

const REGLAS = {
  sede_id: 'entero',
  gps_dispositivo_id: 'entero',
  placa: 'texto|max:15',
  tipo: 'texto|max:40',
  capacidad_ton: 'numero|positivo|hasta:200',
  velocidad_maxima_kmh: 'entero|positivo|hasta:140',
  estado: 'en:disponible,mantenimiento,inactivo'
}

async function revisarRelaciones(datos, giroId, vehiculoId = 0) {
  if (datos.placa !== undefined) {
    datos.placa = String(datos.placa).toUpperCase()
    if (await Transporte.existePlaca(datos.placa, vehiculoId)) throw conflicto('Ya existe un vehículo con esa placa')
  }
  if (datos.velocidad_maxima_kmh !== undefined && datos.velocidad_maxima_kmh < 20) {
    throw invalido({ velocidad_maxima_kmh: 'Debe estar entre 20 y 140 km/h' })
  }
  if (datos.sede_id) {
    const sede = await Catalogo.buscarSede(datos.sede_id)
    if (sede?.giro_id !== giroId) throw invalido({ sede_id: 'La sede no pertenece al giro del vehículo' })
  }
  if (datos.gps_dispositivo_id) {
    const gps = await Gps.buscarDispositivo(datos.gps_dispositivo_id)
    if (!gps || gps.tipo !== 'camion') throw invalido({ gps_dispositivo_id: 'Debe ser un dispositivo GPS de camión' })
    if (gps.maquina_id || (gps.vehiculo_id && gps.vehiculo_id !== vehiculoId)) throw conflicto(`El GPS ${gps.codigo_externo} ya está asignado`)
  }
}

export async function crearVehiculo(req, res) {
  const central = esCentral(req.usuario)
  const datos = validar(req.body, {
    ...REGLAS,
    giro_id: central ? 'requerido|entero' : 'entero',
    placa: 'requerido|texto|max:15',
    tipo: 'requerido|texto|max:40'
  })
  const giroId = central ? datos.giro_id : req.usuario.giro_id
  if (!central && datos.giro_id && datos.giro_id !== giroId) throw prohibido('Solo puede registrar vehículos de su giro de negocio')
  if (!(await Catalogo.buscarGiro(giroId))) throw invalido({ giro_id: 'El giro de negocio no existe' })
  await revisarRelaciones(datos, giroId)
  const nuevo = await Transporte.crearVehiculo({ ...datos, giro_id: giroId })
  if (datos.estado && datos.estado !== 'disponible') await Transporte.actualizarVehiculo(nuevo, { estado: datos.estado })
  creado(res, await Transporte.buscarVehiculo(nuevo), 'Vehículo registrado')
}

export async function actualizarVehiculo(req, res) {
  const vehiculo = await Transporte.buscarVehiculo(id(req))
  if (!vehiculo) throw noEncontrado('Vehículo')
  if (!puedeVerGiro(req.usuario, vehiculo.giro_id)) throw prohibido('Solo puede modificar vehículos de su giro de negocio')
  const datos = validar(req.body, REGLAS)
  if (!Object.keys(datos).length) throw invalido({}, 'Envíe al menos un campo para actualizar')
  // "en_ruta" lo maneja el flujo de viajes
  if (datos.estado && datos.estado !== vehiculo.estado && vehiculo.estado === 'en_ruta') {
    throw conflicto('El vehículo está en ruta: marque el viaje como entregado antes de cambiar su estado')
  }
  await revisarRelaciones(datos, vehiculo.giro_id, vehiculo.id)
  await Transporte.actualizarVehiculo(vehiculo.id, datos)
  ok(res, await Transporte.buscarVehiculo(vehiculo.id))
}

// ------------------------------------------------------------------ viajes

export async function crearViaje(req, res) {
  creado(res, await TransporteService.crearViaje(req.usuario, req.body), 'Viaje programado')
}

// ?mios=1: los viajes del piloto que consulta
export async function listarViajes(req, res) {
  const f = validar(req.query, {
    estado: `en:${Transporte.ESTADOS_VIAJE}`,
    giro_id: 'entero',
    cliente_id: 'entero',
    vehiculo_id: 'entero',
    pedido_id: 'entero',
    pedido_interno_id: 'entero',
    desde: 'fecha',
    mios: 'booleano'
  })
  if (f.mios && !req.usuario.cliente_id) f.piloto_id = req.usuario.id
  const pag = paginacion(req.query)
  const [filas, total] = await Transporte.listarViajes({ ...f, ...TransporteService.alcance(req.usuario) }, pag)
  paginado(res, filas, total, pag)
}

export async function verViaje(req, res) {
  const viaje = await TransporteService.obtener(req.usuario, id(req))
  ok(res, await TransporteService.conSeguimiento(viaje))
}

export async function cambiarEstadoViaje(req, res) {
  ok(res, await TransporteService.cambiarEstadoViaje(req.usuario, id(req), req.body))
}
