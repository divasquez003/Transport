import { creado, id, ok, paginacion, paginado } from '../lib/http.js'
import { validar } from '../lib/validar.js'
import * as Operaciones from '../models/operaciones.js'
import * as ProyectoService from '../services/proyectos.js'

// El cliente ve sus obras; el personal, las de su giro (con el avance esperado según el plazo)
export async function listar(req, res) {
  const f = validar(req.query, {
    estado: `en:${Operaciones.ESTADOS_PROYECTO}`,
    tipo: `en:${Operaciones.TIPOS_PROYECTO}`,
    giro_id: 'entero',
    cliente_id: 'entero'
  })
  const pag = paginacion(req.query)
  const [filas, total] = await Operaciones.listarProyectos({ ...f, ...ProyectoService.alcance(req.usuario) }, pag)
  paginado(res, filas.map(ProyectoService.conPlazo), total, pag)
}

export async function crear(req, res) {
  creado(res, await ProyectoService.crear(req.usuario, req.body), 'Proyecto registrado')
}

export async function ver(req, res) {
  ok(res, ProyectoService.conPlazo(await ProyectoService.obtener(req.usuario, id(req))))
}

export async function actualizar(req, res) {
  ok(res, await ProyectoService.actualizar(req.usuario, id(req), req.body))
}

export async function agregarAvance(req, res) {
  creado(res, await ProyectoService.agregarAvance(req.usuario, id(req), req.body), 'Avance registrado')
}
