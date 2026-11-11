import { config } from '../config.js'
import { creado, id, invalido, noEncontrado, ok } from '../lib/http.js'
import { ahora } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import * as Alertas from '../models/alertas.js'
import { pushHabilitado } from '../services/push.js'

// ------------------------------------------------------------------ alertas del usuario

export async function listar(req, res) {
  const f = validar(req.query, { no_leidas: 'booleano', limite: 'entero|positivo|hasta:200' })
  const alertas = await Alertas.listar(req.usuario.id, f.no_leidas, f.limite ?? 50)
  ok(res, alertas, { no_leidas: await Alertas.noLeidas(req.usuario.id) })
}

export async function marcarTodas(req, res) {
  ok(res, { marcadas: await Alertas.marcarTodas(req.usuario.id) })
}

export async function marcarLeida(req, res) {
  const alerta = await Alertas.buscar(id(req), req.usuario.id)
  if (!alerta) throw noEncontrado('Alerta', 'a')
  await Alertas.marcarLeida(alerta.id)
  ok(res, { id: alerta.id, leida: true, no_leidas: await Alertas.noLeidas(req.usuario.id) })
}

// ------------------------------------------------------------------ recordatorios personales

const REPETICIONES = 'ninguna,diaria,semanal,mensual'

export async function listarRecordatorios(req, res) {
  const f = validar(req.query, { pendientes: 'booleano' })
  ok(res, await Alertas.recordatorios(req.usuario.id, f.pendientes))
}

// A la hora indicada la tarea programada lo convierte en alerta y notificación push
export async function crearRecordatorio(req, res) {
  const datos = validar(req.body, {
    titulo: 'requerido|texto|max:150',
    descripcion: 'texto|max:500',
    fecha_hora: 'requerido|fechahora',
    repeticion: `en:${REPETICIONES}`
  })
  if (datos.fecha_hora <= ahora()) throw invalido({ fecha_hora: 'Debe ser una fecha y hora futura' })
  const nuevo = await Alertas.crearRecordatorio({ ...datos, usuario_id: req.usuario.id, repeticion: datos.repeticion ?? 'ninguna' })
  creado(res, await Alertas.buscarRecordatorio(nuevo), 'Recordatorio programado')
}

export async function eliminarRecordatorio(req, res) {
  const recordatorio = await Alertas.buscarRecordatorio(id(req))
  if (!recordatorio || recordatorio.usuario_id !== req.usuario.id) throw noEncontrado('Recordatorio')
  await Alertas.eliminarRecordatorio(recordatorio.id)
  ok(res, { id: recordatorio.id, eliminado: true })
}

// ------------------------------------------------------------------ notificaciones push (PWA)

export function clavePublica(req, res) {
  ok(res, { habilitado: pushHabilitado, clave_publica: pushHabilitado ? config.push.publica : null })
}

// Acepta el objeto PushSubscription del navegador tal cual: { endpoint, keys: { p256dh, auth } }
export async function suscribir(req, res) {
  const datos = validar(req.body, { endpoint: 'requerido|url|max:500', keys: 'requerido|objeto' })
  const llaves = validar(datos.keys, { p256dh: 'requerido|texto|max:255', auth: 'requerido|texto|max:100' })
  const suscripcion = await Alertas.guardarSuscripcion(req.usuario.id, { endpoint: datos.endpoint, ...llaves })
  creado(res, { id: suscripcion, push_habilitado: pushHabilitado }, 'Notificaciones activadas en este dispositivo')
}
