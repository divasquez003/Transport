import { conflicto, creado, id, invalido, noEncontrado, ok, paginacion, paginado, prohibido } from '../lib/http.js'
import { hoy, sumarDias } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { esCentral, esPersonal, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Gps from '../models/gps.js'
import * as Maquinaria from '../models/maquinaria.js'
import * as MaquinariaService from '../services/maquinaria.js'

// Datos internos que no se muestran en la sala de ventas
const publica = ({ gps_dispositivo_id, horometro, ...maquina }) => maquina

// ------------------------------------------------------------------ máquinas

// Catálogo de maquinaria; con ?fecha_inicio=&fecha_fin= indica cuáles están libres en esas fechas
export async function listar(req, res) {
  const f = validar(req.query, {
    giro_id: 'entero',
    sede_id: 'entero',
    estado: `en:${Maquinaria.ESTADOS_MAQUINA}`,
    tipo: 'texto|max:60',
    producto_id: 'entero',
    fecha_inicio: 'fecha',
    fecha_fin: 'fecha'
  })
  const personal = esPersonal(req.usuario)
  let maquinas = await Maquinaria.listarMaquinas({ ...f, publico: !personal })
  if (f.fecha_inicio || f.fecha_fin) {
    const { desde, hasta } = MaquinariaService.rango(req.query)
    maquinas = await Promise.all(maquinas.map(async (m) => {
      const consulta = await MaquinariaService.disponibilidad(m, desde, hasta)
      return { ...m, disponible_en_fechas: consulta.disponible, total_estimado: consulta.total_estimado }
    }))
  }
  ok(res, personal ? maquinas : maquinas.map(publica))
}

// Ficha de la máquina con sus próximas reservas; el personal ve además el GPS y el alquiler activo
export async function ver(req, res) {
  const maquina = await Maquinaria.buscarMaquina(id(req))
  const personal = esPersonal(req.usuario)
  if (!maquina || (!personal && maquina.estado === 'vendida')) throw noEncontrado('Máquina', 'a')
  maquina.proximas_reservas = await Maquinaria.ocupacion(maquina.id, hoy(), sumarDias(hoy(), 180))
  if (!personal) return ok(res, publica(maquina))
  maquina.alquiler_activo = await Maquinaria.alquilerActivo(maquina.id)
  maquina.gps = maquina.gps_dispositivo_id ? await Gps.buscarDispositivo(maquina.gps_dispositivo_id) : null
  ok(res, maquina)
}

const REGLAS = {
  sede_id: 'entero',
  producto_id: 'entero',
  gps_dispositivo_id: 'entero',
  codigo: 'texto|max:30',
  tipo: 'texto|max:60',
  marca: 'texto|max:60',
  modelo: 'texto|max:60',
  anio: 'entero|hasta:2100',
  estado: 'en:disponible,en_uso,mantenimiento,vendida',
  tarifa_diaria: 'numero|no_negativo|hasta:9999999',
  precio_venta: 'numero|no_negativo|hasta:999999999',
  horometro: 'numero|no_negativo|hasta:999999'
}

// Revisa que la sede, el servicio de alquiler y el GPS correspondan a la máquina
async function revisarRelaciones(datos, giroId, maquinaId = 0) {
  if (datos.anio !== undefined && datos.anio < 1950) throw invalido({ anio: 'Año no válido' })
  if (datos.codigo !== undefined) {
    datos.codigo = String(datos.codigo).toUpperCase()
    if (await Maquinaria.existeCodigoMaquina(datos.codigo, maquinaId)) throw conflicto('Ya existe una máquina con ese código')
  }
  if (datos.sede_id) {
    const sede = await Catalogo.buscarSede(datos.sede_id)
    if (sede?.giro_id !== giroId) throw invalido({ sede_id: 'La sede no pertenece al giro de la máquina' })
  }
  if (datos.producto_id) {
    const producto = await Catalogo.buscarProducto(datos.producto_id, true)
    if (producto?.giro_id !== giroId || producto.tipo !== 'alquiler') throw invalido({ producto_id: 'Debe ser un servicio de alquiler del mismo giro' })
  }
  if (datos.gps_dispositivo_id) {
    const gps = await Gps.buscarDispositivo(datos.gps_dispositivo_id)
    if (!gps || gps.tipo !== 'maquinaria') throw invalido({ gps_dispositivo_id: 'Debe ser un dispositivo GPS de maquinaria' })
    if (gps.vehiculo_id || (gps.maquina_id && gps.maquina_id !== maquinaId)) throw conflicto(`El GPS ${gps.codigo_externo} ya está asignado`)
  }
}

export async function crear(req, res) {
  const central = esCentral(req.usuario)
  const datos = validar(req.body, {
    ...REGLAS,
    giro_id: central ? 'requerido|entero' : 'entero',
    codigo: 'requerido|texto|max:30',
    tipo: 'requerido|texto|max:60'
  })
  const giroId = central ? datos.giro_id : req.usuario.giro_id
  if (!central && datos.giro_id && datos.giro_id !== giroId) throw prohibido('Solo puede registrar máquinas de su giro de negocio')
  if (!(await Catalogo.buscarGiro(giroId))) throw invalido({ giro_id: 'El giro de negocio no existe' })
  await revisarRelaciones(datos, giroId)
  const nueva = await Maquinaria.crearMaquina({ ...datos, giro_id: giroId })
  creado(res, await Maquinaria.buscarMaquina(nueva), 'Máquina registrada')
}

export async function actualizar(req, res) {
  const maquina = await Maquinaria.buscarMaquina(id(req))
  if (!maquina) throw noEncontrado('Máquina', 'a')
  if (!puedeVerGiro(req.usuario, maquina.giro_id)) throw prohibido('Solo puede modificar máquinas de su giro de negocio')
  const datos = validar(req.body, REGLAS)
  if (!Object.keys(datos).length) throw invalido({}, 'Envíe al menos un campo para actualizar')
  // "alquilada" lo maneja el flujo de alquileres
  if (datos.estado && datos.estado !== maquina.estado && maquina.estado === 'alquilada') {
    throw conflicto('La máquina está alquilada: finalice el alquiler activo antes de cambiar su estado')
  }
  await revisarRelaciones(datos, maquina.giro_id, maquina.id)
  await Maquinaria.actualizarMaquina(maquina.id, datos)
  ok(res, await Maquinaria.buscarMaquina(maquina.id))
}

// ?fecha_inicio=AAAA-MM-DD&fecha_fin=AAAA-MM-DD (por defecto, los próximos 30 días)
export async function disponibilidad(req, res) {
  const maquina = await Maquinaria.buscarMaquina(id(req))
  if (!maquina || maquina.estado === 'vendida') throw noEncontrado('Máquina', 'a')
  const { desde, hasta } = MaquinariaService.rango(req.query)
  ok(res, await MaquinariaService.disponibilidad(maquina, desde, hasta))
}

// ------------------------------------------------------------------ alquileres

export async function crearAlquiler(req, res) {
  creado(res, await MaquinariaService.crearAlquiler(req.usuario, req.body), 'Alquiler reservado')
}

export async function listarAlquileres(req, res) {
  const f = validar(req.query, { estado: `en:${Maquinaria.ESTADOS_ALQUILER}`, maquina_id: 'entero', cliente_id: 'entero', giro_id: 'entero' })
  const pag = paginacion(req.query)
  const [filas, total] = await Maquinaria.listarAlquileres({ ...f, ...MaquinariaService.alcance(req.usuario) }, pag)
  paginado(res, filas, total, pag)
}

export async function cambiarEstadoAlquiler(req, res) {
  ok(res, await MaquinariaService.cambiarEstadoAlquiler(req.usuario, id(req), req.body))
}
