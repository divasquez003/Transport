import { creado, id, ok, paginacion, paginado } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import { giroDe } from '../middlewares/acceso.js'
import * as Operaciones from '../models/operaciones.js'
import * as ProduccionService from '../services/produccion.js'

// ------------------------------------------------------------------ extracción minera

export async function registrarExtraccion(req, res) {
  creado(res, await ProduccionService.registrarExtraccion(req.usuario, req.body), 'Extracción registrada')
}

// Registros por turno y el total extraído de cada materia prima en el periodo
export async function listarExtraccion(req, res) {
  const f = validar(req.query, { sede_id: 'entero', producto_id: 'entero', giro_id: 'entero', desde: 'fecha', hasta: 'fecha' })
  f.giro_id = giroDe(req.usuario, f.giro_id)
  const pag = paginacion(req.query, 30)
  const [filas, total] = await Operaciones.listarExtraccion(f, pag)
  paginado(res, filas, total, pag, { resumen: await Operaciones.resumenExtraccion(f) })
}

// ------------------------------------------------------------------ órdenes de producción

export async function crearOrden(req, res) {
  creado(res, await ProduccionService.crearOrden(req.usuario, req.body), 'Orden de producción creada')
}

export async function listarOrdenes(req, res) {
  const f = validar(req.query, { sede_id: 'entero', giro_id: 'entero', estado: `en:${Operaciones.ESTADOS_ORDEN}` })
  f.giro_id = giroDe(req.usuario, f.giro_id)
  const pag = paginacion(req.query)
  const [filas, total] = await Operaciones.listarOrdenes(f, pag)
  paginado(res, filas, total, pag)
}

export async function actualizarOrden(req, res) {
  ok(res, await ProduccionService.actualizarOrden(req.usuario, id(req), req.body))
}
