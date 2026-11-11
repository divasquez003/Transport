import { config } from '../config.js'
import { transaccion } from '../db.js'
import { invalido } from '../lib/http.js'
import { aHoraLocal, ahora, cantidad } from '../lib/formato.js'
import { fechaHora, validar } from '../lib/validar.js'
import * as Alertas from '../models/alertas.js'
import * as Gps from '../models/gps.js'
import * as Integraciones from '../models/integraciones.js'
import * as Transporte from '../models/transporte.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from './alertas.js'

const MAXIMO_EVENTOS = 500

// Acepta "2026-10-08 14:30:00" (hora de Guatemala) o ISO 8601 con zona: "2026-10-08T20:30:00Z"
function normalizarFecha(texto) {
  if (texto === undefined || texto === null || texto === '') return ahora()
  const local = fechaHora(String(texto))
  if (local) return local
  const fecha = new Date(String(texto))
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(String(texto)) && !Number.isNaN(fecha.getTime()) ? aHoraLocal(fecha) : null
}

function validarEvento(entrada) {
  const e = validar(entrada, {
    dispositivo: 'requerido|texto|max:50',
    latitud: 'requerido|numero',
    longitud: 'requerido|numero',
    velocidad_kmh: 'numero|no_negativo|hasta:300',
    motor_encendido: 'booleano',
    horas_uso: 'numero|no_negativo'
  })
  // La regla "numero" redondea a 2 decimales: las coordenadas se toman del dato original
  e.latitud = Number(entrada.latitud)
  e.longitud = Number(entrada.longitud)
  if (Math.abs(e.latitud) > 90 || Math.abs(e.longitud) > 180) throw invalido({ latitud: 'Coordenadas fuera de rango' })
  e.registrado_en = normalizarFecha(entrada.registrado_en)
  if (!e.registrado_en) throw invalido({ registrado_en: 'Fecha y hora no válidas' })
  // Si el reloj del dispositivo va adelantado se usa la hora de llegada
  if (e.registrado_en > ahora()) e.registrado_en = ahora()
  return e
}

const fueraDeHorario = (registradoEn) => {
  const hora = Number(registradoEn.slice(11, 13))
  return hora < config.horario.inicio || hora >= config.horario.fin
}

// Revisa el evento y genera alertas sin repetirlas (el GPS reporta cada pocos minutos)
async function revisar(dispositivo, evento) {
  const generadas = []
  if (dispositivo.vehiculo_id && evento.velocidad_kmh > dispositivo.velocidad_maxima_kmh) {
    if (!(await Alertas.existeReciente('exceso_velocidad', 'vehiculo', dispositivo.vehiculo_id, 15))) {
      const viaje = await Transporte.viajeEnRutaDe(dispositivo.vehiculo_id)
      // Al gerente del giro y al piloto del viaje en curso
      const destinatarios = await Usuarios.idsPorGiro(dispositivo.giro_id, ['gerente'])
      if (viaje?.piloto_id) destinatarios.push(viaje.piloto_id)
      await AlertaService.enviar(destinatarios, {
        tipo: 'exceso_velocidad',
        titulo: `Exceso de velocidad: ${dispositivo.placa}`,
        mensaje: `${cantidad(evento.velocidad_kmh)} km/h (máximo ${dispositivo.velocidad_maxima_kmh})${viaje ? ` en el viaje ${viaje.codigo}` : ''} a las ${evento.registrado_en.slice(11, 16)}.`,
        prioridad: 'alta',
        entidad: 'vehiculo',
        entidad_id: dispositivo.vehiculo_id
      })
      generadas.push('exceso_velocidad')
    }
  }
  if (dispositivo.maquina_id && evento.motor_encendido) {
    // Máquina encendida de noche, o que debería estar parada en la sucursal o en el taller
    let tipo = null
    let motivo = ''
    if (['disponible', 'mantenimiento'].includes(dispositivo.estado_maquina)) {
      tipo = 'uso_no_autorizado'
      motivo = `está ${dispositivo.estado_maquina === 'disponible' ? 'disponible en sucursal' : 'en mantenimiento'} y reporta el motor encendido`
    } else if (fueraDeHorario(evento.registrado_en)) {
      tipo = 'uso_fuera_horario'
      motivo = `reporta el motor encendido fuera del horario (${config.horario.inicio}:00 a ${config.horario.fin}:00)`
    }
    if (tipo && !(await Alertas.existeReciente(tipo, 'maquina', dispositivo.maquina_id, 60))) {
      await AlertaService.aGiro(dispositivo.giro_id, ['gerente', 'administrativo'], {
        tipo,
        titulo: `Alerta de maquinaria: ${dispositivo.maquina}`,
        mensaje: `${dispositivo.maquina} ${motivo} a las ${evento.registrado_en.slice(11, 16)}.`,
        prioridad: 'alta',
        entidad: 'maquina',
        entidad_id: dispositivo.maquina_id
      })
      generadas.push(tipo)
    }
  }
  if (dispositivo.maquina_id && evento.horas_uso != null) await Gps.actualizarHorometro(dispositivo.maquina_id, evento.horas_uso)
  return generadas
}

// Recibe uno o varios eventos de GPS-Inversiones: { dispositivo, latitud, longitud, ... } o { eventos: [...] }
export async function recibir(cuerpo) {
  const lista = Array.isArray(cuerpo?.eventos) ? cuerpo.eventos : Array.isArray(cuerpo) ? cuerpo : [cuerpo]
  if (!lista.length) throw invalido({ eventos: 'Envíe al menos un evento' })
  if (lista.length > MAXIMO_EVENTOS) throw invalido({ eventos: `Máximo ${MAXIMO_EVENTOS} eventos por envío` })

  const rechazados = []
  const alertas = []
  let recibidos = 0
  for (const [indice, entrada] of lista.entries()) {
    try {
      const evento = validarEvento(entrada)
      const dispositivo = await Gps.dispositivoPorCodigo(evento.dispositivo)
      if (!dispositivo) throw invalido({ dispositivo: `Dispositivo ${evento.dispositivo} no registrado` })
      await transaccion(async () => {
        await Gps.registrarEvento({ ...evento, dispositivo_id: dispositivo.id })
        alertas.push(...await revisar(dispositivo, evento))
      })
      recibidos++
    } catch (error) {
      if (!error.estado) throw error
      rechazados.push({ indice, errores: error.errores ?? { evento: error.message } })
    }
  }
  await Integraciones.bitacora({
    tipo: 'gps',
    referencia: 'GPS-Inversiones',
    estado: recibidos ? 'exitoso' : 'fallido',
    detalle: `${recibidos} eventos recibidos${rechazados.length ? `, ${rechazados.length} rechazados` : ''}${alertas.length ? `; alertas: ${alertas.join(', ')}` : ''}`
  })
  return { recibidos, rechazados, alertas }
}
