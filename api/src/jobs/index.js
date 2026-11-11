import { ahora, horaActual, hoy, sumarHoras } from '../lib/formato.js'
import * as Alertas from '../models/alertas.js'
import * as Tareas from '../models/tareas.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from '../services/alertas.js'

// Tareas programadas dentro de la API: recordatorios cada minuto y revisiones diarias a las 7:00
const HORA_DIARIA = 7
let temporizador = null
let ocupado = false
let ultimaRevisionDiaria = null

const SIGUIENTE = { diaria: 24, semanal: 24 * 7 }

// Siguiente fecha de un recordatorio que se repite (si estuvo detenido, salta las fechas pasadas)
function siguienteFecha(fechaHora, repeticion, momento) {
  let siguiente = fechaHora
  do {
    if (repeticion === 'mensual') {
      const [fecha, hora] = siguiente.split(' ')
      const [a, m, d] = fecha.split('-').map(Number)
      const mes = new Date(Date.UTC(a, m, 1))
      const dia = Math.min(d, new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 0)).getUTCDate())
      siguiente = `${mes.toISOString().slice(0, 8)}${String(dia).padStart(2, '0')} ${hora}`
    } else {
      siguiente = sumarHoras(siguiente, SIGUIENTE[repeticion])
    }
  } while (siguiente <= momento)
  return siguiente
}

export async function enviarRecordatorios(momento) {
  const vencidos = await Alertas.recordatoriosVencidos()
  for (const r of vencidos) {
    await AlertaService.enviar([r.usuario_id], {
      tipo: 'recordatorio',
      titulo: r.titulo,
      mensaje: r.descripcion ?? `Recordatorio programado para ${r.fecha_hora.slice(0, 16)}`,
      prioridad: 'alta'
    })
    if (r.repeticion === 'ninguna') await Alertas.marcarRecordatorioEnviado(r.id)
    else await Alertas.reprogramarRecordatorio(r.id, siguienteFecha(r.fecha_hora, r.repeticion, momento))
  }
  return vencidos.length
}

// Envía la alerta solo si no se envió la misma en las últimas 20 horas
async function avisarUnaVez(destinatarios, alerta) {
  if (await Alertas.existeReciente(alerta.tipo, alerta.entidad, alerta.entidad_id, 20 * 60)) return 0
  return AlertaService.enviar(destinatarios, alerta)
}

export async function revisionDiaria() {
  let enviadas = 0
  for (const a of await Tareas.alquileresVencidos()) {
    const personal = await Usuarios.idsPorGiro(a.giro_id, ['gerente'])
    if (a.vendedor_id) personal.push(a.vendedor_id)
    const alerta = {
      tipo: 'alquiler_vencido',
      titulo: `Alquiler ${a.codigo} vencido`,
      mensaje: `${a.tipo_maquina} ${a.maquina} de ${a.cliente} debía devolverse el ${a.fecha_fin} (${a.dias_atraso} día(s) de atraso).`,
      prioridad: 'alta',
      entidad: 'alquiler',
      entidad_id: a.id
    }
    enviadas += await avisarUnaVez([...personal, ...await Usuarios.idsDeCliente(a.cliente_id)], alerta)
  }
  for (const a of await Tareas.entregasDeHoy()) {
    const personal = await Usuarios.idsPorGiro(a.giro_id, ['gerente'])
    if (a.vendedor_id) personal.push(a.vendedor_id)
    enviadas += await avisarUnaVez(personal, {
      tipo: 'alquiler_entrega_hoy',
      titulo: `Entregar hoy: ${a.tipo_maquina} ${a.maquina}`,
      mensaje: `La reserva ${a.codigo} de ${a.cliente} inicia hoy. Márquela como activa al entregar la máquina.`,
      entidad: 'alquiler',
      entidad_id: a.id
    })
  }
  for (const g of await Tareas.bajoMinimoPorGiro()) {
    enviadas += await avisarUnaVez(await Usuarios.idsPorGiro(g.giro_id, ['gerente', 'administrativo']), {
      tipo: 'resumen_stock_bajo',
      titulo: `${g.productos} producto(s) bajo la existencia mínima`,
      mensaje: `${g.detalle}. Considere un pedido interno o una orden de producción.`,
      prioridad: 'alta',
      entidad: 'producto',
      entidad_id: g.giro_id
    })
  }
  for (const p of await Tareas.proyectosVencidos()) {
    enviadas += await avisarUnaVez(await Usuarios.idsPorGiro(p.giro_id, ['gerente']), {
      tipo: 'proyecto_vencido',
      titulo: `Plazo vencido: ${p.codigo}`,
      mensaje: `${p.nombre} debía terminar el ${p.fecha_fin_estimada} y va en ${p.avance_porcentaje} %.`,
      prioridad: 'alta',
      entidad: 'proyecto',
      entidad_id: p.id
    })
  }
  for (const r of await Tareas.reunionesDeManana()) {
    const donde = r.modalidad === 'presencial' ? r.lugar : `videoconferencia${r.enlace ? ` (${r.enlace})` : ''}`
    const destinatarios = [...await Usuarios.idsDeCliente(r.cliente_id), ...(r.vendedor_id ? [r.vendedor_id] : [])]
    enviadas += await avisarUnaVez(destinatarios, {
      tipo: 'reunion_manana',
      titulo: `Mañana: ${r.asunto}`.slice(0, 150),
      mensaje: `Reunión con ${r.cliente} a las ${r.fecha_hora.slice(11, 16)} en ${donde}.`,
      entidad: 'reunion',
      entidad_id: r.id
    })
  }
  return enviadas
}

async function ciclo() {
  if (ocupado) return
  ocupado = true
  try {
    await enviarRecordatorios(ahora())
    if (ultimaRevisionDiaria !== hoy() && horaActual() >= HORA_DIARIA) {
      ultimaRevisionDiaria = hoy()
      const enviadas = await revisionDiaria()
      console.log(`[tareas] revisión diaria ${hoy()}: ${enviadas} alertas`)
    }
  } catch (error) {
    console.error('[tareas]', error.message)
  } finally {
    ocupado = false
  }
}

export function iniciarTareas() {
  if (temporizador) return
  console.log('[tareas] recordatorios cada minuto y revisión diaria a las 7:00')
  setTimeout(ciclo, 3000)
  temporizador = setInterval(ciclo, 60 * 1000)
}

export function detenerTareas() {
  clearInterval(temporizador)
  temporizador = null
}
