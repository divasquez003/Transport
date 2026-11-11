import { config } from '../config.js'
import { uno } from '../db.js'
import { ok } from '../lib/http.js'
import { ahora } from '../lib/formato.js'
import { catalogo } from '../routes.js'
import { pushHabilitado } from '../services/push.js'

export function inicio(req, res) {
  ok(res, { api: config.nombre, version: config.version, estado: '/api/salud', documentacion: 'docs/endpoints.md' })
}

// Estado de la API, de la conexión a MySQL y del catálogo de endpoints
export async function estado(req, res) {
  const host = `${config.db.host}:${config.db.port}`
  let baseDatos = { conectada: false, host }
  try {
    const fila = await uno('SELECT VERSION() AS version, DATABASE() AS base, NOW() AS hora')
    baseDatos = { conectada: true, servidor: `MySQL ${fila.version}`, base: fila.base, host, hora: fila.hora }
  } catch (error) {
    baseDatos.error = config.debug ? error.message : 'No se pudo conectar a la base de datos'
  }
  res.status(baseDatos.conectada ? 200 : 503).json({
    ok: baseDatos.conectada,
    data: {
      api: config.nombre,
      version: config.version,
      node: process.version,
      hora_servidor: ahora(),
      base_de_datos: baseDatos,
      endpoints: { total: catalogo.length, implementados: catalogo.length, avance: '100%' },
      notificaciones_push: pushHabilitado,
      tareas_programadas: config.tareas
    }
  })
}
