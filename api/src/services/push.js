import webpush from 'web-push'
import { config } from '../config.js'
import * as Alertas from '../models/alertas.js'

// Notificaciones Web Push a la PWA (celular o escritorio), con las llaves VAPID del .env
export const pushHabilitado = Boolean(config.push.publica && config.push.privada)

if (pushHabilitado) {
  webpush.setVapidDetails(config.push.contacto, config.push.publica, config.push.privada)
}

export async function enviarPush(usuarioIds, notificacion) {
  if (!pushHabilitado || !usuarioIds.length) return
  const suscripciones = await Alertas.suscripcionesDe(usuarioIds)
  await Promise.all(suscripciones.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(notificacion),
        { TTL: 3600 }
      )
    } catch (error) {
      // 404 o 410: el navegador ya no tiene esa suscripción
      if ([404, 410].includes(error.statusCode)) await Alertas.borrarSuscripcion(s.id)
      else console.error('[push]', error.statusCode ?? error.message)
    }
  }))
}
