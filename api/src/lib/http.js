export class HttpError extends Error {
  constructor(estado, mensaje, errores) {
    super(mensaje)
    this.estado = estado
    this.errores = errores
  }
}

export const invalido = (errores, mensaje = 'Datos no válidos') => new HttpError(422, mensaje, errores)
// genero 'a' para sustantivos femeninos: noEncontrado('Sede', 'a') => Sede no encontrada
export const noEncontrado = (que, genero = 'o') => new HttpError(404, `${que} no encontrad${genero}`)
export const prohibido = (mensaje) => new HttpError(403, mensaje)
export const conflicto = (mensaje) => new HttpError(409, mensaje)

export function ok(res, data, extra = {}) {
  res.json({ ok: true, data, ...extra })
}

export function creado(res, data, mensaje = 'Registro creado') {
  res.status(201).json({ ok: true, mensaje, data })
}

export function paginado(res, filas, total, pag, extra = {}) {
  res.json({
    ok: true,
    data: filas,
    ...extra,
    paginacion: {
      pagina: pag.pagina,
      por_pagina: pag.porPagina,
      total,
      paginas: Math.ceil(total / pag.porPagina)
    }
  })
}

// ?pagina=2&por_pagina=10
export function paginacion(query, porDefecto = 20, maximo = 100) {
  const pagina = Math.max(1, Number.parseInt(query.pagina, 10) || 1)
  const porPagina = Math.min(maximo, Math.max(1, Number.parseInt(query.por_pagina, 10) || porDefecto))
  return { pagina, porPagina, desde: (pagina - 1) * porPagina }
}

export function id(req, nombre = 'id') {
  return Number(req.params[nombre])
}

export function enviarCsv(res, nombreArchivo, contenido) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`)
  res.send('\uFEFF' + contenido)
}
