import { transaccion } from '../db.js'
import { conflicto, invalido, noEncontrado, prohibido } from '../lib/http.js'
import { diasEntre, estado as etiqueta, hoy, quetzales, redondear, sumarDias } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { esCentral, esCliente, puedeVerGiro } from '../middlewares/acceso.js'
import * as Clientes from '../models/clientes.js'
import * as Maquinaria from '../models/maquinaria.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from './alertas.js'
import * as Webhooks from './webhooks.js'

const MAXIMO_DIAS = 365
const NO_ALQUILABLE = ['mantenimiento', 'vendida']

// reservado -> activo (se entrega la máquina) -> finalizado (se devuelve)
const FLUJO = {
  reservado: ['activo', 'cancelado'],
  activo: ['finalizado'],
  finalizado: [],
  cancelado: []
}

const dias = (desde, hasta) => diasEntre(desde, hasta) + 1
const SITUACION = { disponible: 'disponible', alquilada: 'alquilada', en_uso: 'en uso', mantenimiento: 'en mantenimiento', vendida: 'vendida' }

// Rango de fechas válido para consultar o reservar
export function rango(entrada, { obligatorio = false } = {}) {
  const r = obligatorio ? 'requerido|' : ''
  const datos = validar(entrada, { fecha_inicio: `${r}fecha`, fecha_fin: `${r}fecha` })
  const desde = datos.fecha_inicio ?? hoy()
  const hasta = datos.fecha_fin ?? sumarDias(desde, 29)
  if (hasta < desde) throw invalido({ fecha_fin: 'Debe ser igual o posterior a la fecha de inicio' })
  if (dias(desde, hasta) > MAXIMO_DIAS) throw invalido({ fecha_fin: `El rango máximo es de ${MAXIMO_DIAS} días` })
  return { desde, hasta }
}

// Disponibilidad de una máquina en el rango: estado, reservas que chocan y costo estimado
export async function disponibilidad(maquina, desde, hasta) {
  const ocupado = await Maquinaria.ocupacion(maquina.id, desde, hasta)
  const alquilable = !NO_ALQUILABLE.includes(maquina.estado) && maquina.tarifa_diaria != null
  const numeroDias = dias(desde, hasta)
  return {
    maquina_id: maquina.id,
    codigo: maquina.codigo,
    estado: maquina.estado,
    desde,
    hasta,
    disponible: alquilable && !ocupado.length,
    motivo: !alquilable
      ? (maquina.tarifa_diaria == null ? 'La máquina no tiene tarifa de alquiler' : `La máquina está ${SITUACION[maquina.estado]}`)
      : ocupado.length ? 'Tiene reservas en esas fechas' : null,
    ocupado,
    tarifa_diaria: maquina.tarifa_diaria,
    dias: numeroDias,
    total_estimado: maquina.tarifa_diaria != null ? redondear(numeroDias * maquina.tarifa_diaria) : null
  }
}

export async function crearAlquiler(usuario, entrada) {
  const cliente = esCliente(usuario)
  const datos = validar(entrada, { maquina_id: 'requerido|entero', cliente_id: cliente ? 'entero' : 'requerido|entero' })
  const { desde, hasta } = rango(entrada, { obligatorio: true })
  if (desde < hoy()) throw invalido({ fecha_inicio: 'No puede ser una fecha pasada' })
  const clienteId = cliente ? usuario.cliente_id : datos.cliente_id
  const registro = await Clientes.basico(clienteId)
  if (!registro?.activo) throw invalido({ cliente_id: 'El cliente no existe o está inactivo' })
  const maquina = await Maquinaria.buscarMaquina(datos.maquina_id)
  if (!maquina) throw invalido({ maquina_id: 'La máquina no existe' })
  if (!cliente && !puedeVerGiro(usuario, maquina.giro_id)) throw prohibido('Solo puede alquilar máquinas de su giro de negocio')

  return transaccion(async () => {
    // Se bloquea la máquina para que dos clientes no reserven las mismas fechas al mismo tiempo
    const bloqueada = await Maquinaria.maquinaBloqueada(maquina.id)
    if (bloqueada.tarifa_diaria == null) throw conflicto(`${bloqueada.codigo} no tiene tarifa de alquiler`)
    if (NO_ALQUILABLE.includes(bloqueada.estado)) throw conflicto(`${bloqueada.codigo} no se puede alquilar: está ${SITUACION[bloqueada.estado]}`)
    const choques = await Maquinaria.ocupacion(maquina.id, desde, hasta)
    if (choques.length) {
      const fechas = choques.map((c) => `${c.fecha_inicio} al ${c.fecha_fin}`).join(', ')
      throw conflicto(`${bloqueada.codigo} ya está reservada en esas fechas (${fechas})`)
    }
    const numeroDias = dias(desde, hasta)
    const total = redondear(numeroDias * bloqueada.tarifa_diaria)
    const alquilerId = await Maquinaria.crearAlquiler({
      maquina_id: maquina.id,
      cliente_id: clienteId,
      vendedor_id: usuario.rol === 'vendedor' ? usuario.id : null,
      fecha_inicio: desde,
      fecha_fin: hasta,
      tarifa_diaria: bloqueada.tarifa_diaria,
      total
    })
    const alquiler = await Maquinaria.buscarAlquiler(alquilerId)
    const detalle = `${maquina.tipo} ${maquina.codigo} del ${desde} al ${hasta} (${numeroDias} días, ${quetzales(total)})`
    await AlertaService.aGiro(maquina.giro_id, ['gerente', 'vendedor'], {
      tipo: 'alquiler_nuevo',
      titulo: `Reserva ${alquiler.codigo}`,
      mensaje: `${registro.nombre}: ${detalle}.`,
      entidad: 'alquiler',
      entidad_id: alquilerId
    }, usuario.id)
    if (!cliente) {
      await AlertaService.aCliente(clienteId, {
        tipo: 'alquiler_nuevo',
        titulo: `Reserva ${alquiler.codigo} registrada`,
        mensaje: `${usuario.nombre} reservó a su nombre: ${detalle}.`,
        entidad: 'alquiler',
        entidad_id: alquilerId
      })
    }
    return alquiler
  })
}

export function alcance(usuario) {
  if (esCliente(usuario)) return { cliente_id: usuario.cliente_id }
  return esCentral(usuario) ? {} : { giro_id: usuario.giro_id }
}

export async function obtenerAlquiler(usuario, alquilerId) {
  const alquiler = await Maquinaria.buscarAlquiler(alquilerId)
  if (!alquiler || (esCliente(usuario) && alquiler.cliente_id !== usuario.cliente_id)) throw noEncontrado('Alquiler')
  if (!esCliente(usuario) && !puedeVerGiro(usuario, alquiler.giro_id)) throw prohibido('El alquiler pertenece a otro giro de negocio')
  return alquiler
}

// activo: se entrega la máquina. finalizado: se devuelve (si se pasa de la fecha se cobran los días extra)
export async function cambiarEstadoAlquiler(usuario, alquilerId, entrada) {
  const datos = validar(entrada, {
    estado: `requerido|en:${Maquinaria.ESTADOS_ALQUILER}`,
    fecha_devolucion: 'fecha',
    comentario: 'texto|max:255'
  })
  const alquiler = await obtenerAlquiler(usuario, alquilerId)
  const actual = alquiler.estado
  const nuevo = datos.estado
  if (!FLUJO[actual].includes(nuevo)) {
    const opciones = FLUJO[actual].join(', ') || 'ninguno (estado final)'
    throw conflicto(`No se puede pasar de '${actual}' a '${nuevo}'. Estados permitidos: ${opciones}`)
  }
  const cliente = esCliente(usuario)
  if (cliente && nuevo !== 'cancelado') throw prohibido('El cliente solo puede cancelar reservas')
  if (nuevo === 'cancelado' && !datos.comentario) throw invalido({ comentario: 'Indique el motivo de la cancelación' })

  const cambios = { estado: nuevo }
  if (nuevo === 'finalizado') {
    const devolucion = datos.fecha_devolucion ?? hoy()
    if (devolucion < alquiler.fecha_inicio) throw invalido({ fecha_devolucion: 'No puede ser anterior al inicio del alquiler' })
    cambios.fecha_devolucion = devolucion
    // Devolución tardía: se cobran los días adicionales a la misma tarifa
    if (devolucion > alquiler.fecha_fin) cambios.total = redondear(dias(alquiler.fecha_inicio, devolucion) * alquiler.tarifa_diaria)
  }

  await transaccion(async () => {
    const maquina = await Maquinaria.maquinaBloqueada(alquiler.maquina_id)
    if (nuevo === 'activo') {
      // Solo se entrega si la máquina está libre (no alquilada a otro cliente, en uso ni en mantenimiento)
      if (maquina.estado !== 'disponible') throw conflicto(`${maquina.codigo} no se puede entregar: está ${SITUACION[maquina.estado]}`)
      await Maquinaria.actualizarMaquina(maquina.id, { estado: 'alquilada' })
    }
    if (nuevo === 'finalizado' && maquina.estado === 'alquilada') await Maquinaria.actualizarMaquina(maquina.id, { estado: 'disponible' })
    await Maquinaria.actualizarAlquiler(alquiler.id, cambios)

    const extra = cambios.total ? ` Se cobran días adicionales: total ${quetzales(cambios.total)}.` : ''
    const alerta = {
      tipo: 'alquiler_estado',
      titulo: `Alquiler ${alquiler.codigo}: ${etiqueta(nuevo)}`,
      mensaje: `${alquiler.tipo_maquina} ${alquiler.maquina} (${alquiler.cliente}).${datos.comentario ? ` ${datos.comentario}.` : ''}${extra}`,
      prioridad: nuevo === 'cancelado' ? 'alta' : 'media',
      entidad: 'alquiler',
      entidad_id: alquiler.id
    }
    if (cliente) {
      const personal = await Usuarios.idsPorGiro(alquiler.giro_id, ['gerente'])
      if (alquiler.vendedor_id) personal.push(alquiler.vendedor_id)
      await AlertaService.enviar(personal, alerta, usuario.id)
    } else {
      await AlertaService.aCliente(alquiler.cliente_id, alerta)
    }
    Webhooks.emitir(alquiler.cliente_id, 'alquiler.estado_cambiado', {
      id: alquiler.id,
      codigo: alquiler.codigo,
      maquina: alquiler.maquina,
      estado: nuevo,
      estado_anterior: actual,
      total: cambios.total ?? alquiler.total
    })
  })
  return Maquinaria.buscarAlquiler(alquiler.id)
}
