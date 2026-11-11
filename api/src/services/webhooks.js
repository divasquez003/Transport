import { createHmac } from 'node:crypto'
import { despues } from '../db.js'
import { ahora } from '../lib/formato.js'
import * as Integraciones from '../models/integraciones.js'

export const EVENTOS = ['pedido.creado', 'pedido.estado_cambiado', 'viaje.entregado', 'alquiler.estado_cambiado']

// Avisa a los sistemas de terceros suscritos al evento. Cada envío va firmado con HMAC-SHA256
// (encabezado X-TransPort-Firma) para que el receptor compruebe que viene de TransPort.
export function emitir(clienteId, evento, datos) {
  if (!clienteId) return
  despues(async () => {
    const suscritos = await Integraciones.webhooksDe(clienteId, evento)
    for (const webhook of suscritos) {
      const cuerpo = JSON.stringify({ evento, fecha: ahora(), datos })
      const firma = createHmac('sha256', webhook.secreto).update(cuerpo).digest('hex')
      let estado = 'fallido'
      let detalle
      try {
        const respuesta = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TransPort-Evento': evento, 'X-TransPort-Firma': `sha256=${firma}` },
          body: cuerpo,
          signal: AbortSignal.timeout(5000)
        })
        estado = respuesta.ok ? 'exitoso' : 'fallido'
        detalle = `HTTP ${respuesta.status}`
      } catch (error) {
        detalle = error.cause?.code ?? error.message
      }
      await Integraciones.bitacora({ cliente_id: clienteId, tipo: 'webhook_salida', referencia: `${evento} ${webhook.url}`, estado, detalle })
    }
  })
}
