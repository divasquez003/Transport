import { id, invalido, noEncontrado, ok, prohibido } from '../lib/http.js'
import { ahora, minutosEntre, sumarHoras } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { giroDe, puedeVerGiro } from '../middlewares/acceso.js'
import * as Gps from '../models/gps.js'
import * as GpsService from '../services/gps.js'

// Lo llama el servicio de GPS-Inversiones (encabezado X-GPS-Token)
export async function recibirEventos(req, res) {
  const resultado = await GpsService.recibir(req.body)
  res.status(resultado.recibidos ? 201 : 422).json({
    ok: resultado.recibidos > 0,
    mensaje: `${resultado.recibidos} eventos registrados`,
    data: resultado
  })
}

// Dispositivos con su última posición (para el mapa de la flota)
export async function listar(req, res) {
  const f = validar(req.query, { giro_id: 'entero', tipo: 'en:camion,maquinaria' })
  ok(res, await Gps.listarDispositivos({ ...f, giro_id: giroDe(req.usuario, f.giro_id) }))
}

async function dispositivoVisible(req) {
  const dispositivo = await Gps.buscarDispositivo(id(req))
  if (!dispositivo) throw noEncontrado('Dispositivo GPS')
  if (!puedeVerGiro(req.usuario, dispositivo.giro_id)) throw prohibido('El dispositivo pertenece a otro giro de negocio')
  return dispositivo
}

export async function posicion(req, res) {
  const d = await dispositivoVisible(req)
  ok(res, {
    ...d,
    sin_reporte: !d.registrado_en,
    minutos_desde_reporte: d.registrado_en ? minutosEntre(d.registrado_en, ahora()) : null
  })
}

// ?desde=AAAA-MM-DD HH:MM&hasta=... (por defecto, las últimas 24 horas; máximo 1,000 puntos)
export async function recorrido(req, res) {
  const d = await dispositivoVisible(req)
  const f = validar(req.query, { desde: 'fechahora', hasta: 'fechahora' })
  const hasta = f.hasta ?? ahora()
  const desde = f.desde ?? sumarHoras(hasta, -24)
  if (desde > hasta) throw invalido({ desde: 'Debe ser anterior a hasta' })
  const puntos = await Gps.recorrido(d.id, desde, hasta)
  ok(res, { dispositivo: d.codigo_externo, placa: d.placa, maquina: d.maquina, desde, hasta, puntos })
}
