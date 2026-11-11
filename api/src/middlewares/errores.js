import { config } from '../config.js'
import { HttpError } from '../lib/http.js'

const ERRORES_MYSQL = {
  ER_DUP_ENTRY: [409, 'Ya existe un registro con esos datos'],
  ER_NO_REFERENCED_ROW_2: [422, 'Hace referencia a un registro que no existe'],
  ER_ROW_IS_REFERENCED_2: [409, 'No se puede eliminar porque tiene registros relacionados'],
  ER_CHECK_CONSTRAINT_VIOLATED: [422, 'Los datos no cumplen las reglas de la base de datos'],
  ER_DATA_TOO_LONG: [422, 'Un dato es demasiado largo'],
  ER_WARN_DATA_OUT_OF_RANGE: [422, 'Un número está fuera del rango permitido']
}

export function manejarErrores(error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error instanceof HttpError) {
    if (error.estado === 405 && error.permitidos) res.setHeader('Allow', error.permitidos)
    return res.status(error.estado).json({ ok: false, mensaje: error.message, ...(error.errores && { errores: error.errores }) })
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, mensaje: 'El cuerpo de la petición no es un JSON válido' })
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, mensaje: 'El archivo o la petición es demasiado grande (máximo 2 MB)' })
  }
  if (ERRORES_MYSQL[error.code]) {
    const [estado, mensaje] = ERRORES_MYSQL[error.code]
    return res.status(estado).json({ ok: false, mensaje, ...(config.debug && { errores: { detalle: error.sqlMessage } }) })
  }
  console.error(error)
  const deBaseDatos = Boolean(error.sqlMessage) || ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)
  res.status(500).json({
    ok: false,
    mensaje: deBaseDatos ? 'Error de base de datos' : 'Error interno del servidor',
    ...(config.debug && { errores: { detalle: error.message } })
  })
}
