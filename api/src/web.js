import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

// La web compilada (web/dist) solo existe cuando se despliega el proyecto completo, por ejemplo en Railway.
// En Docker la sirve nginx y esta parte no se activa.
const CARPETA = process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url))
export const hayWeb = existsSync(path.join(CARPETA, 'index.html'))

const SIN_CACHE = new Set(['index.html', 'sw.js', 'manifest.webmanifest'])

export const archivos = express.static(CARPETA, {
  index: false,
  setHeaders(res, ruta) {
    if (ruta.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    else if (SIN_CACHE.has(path.basename(ruta))) res.setHeader('Cache-Control', 'no-cache')
  }
})

// Rutas de React (/catalogo, /portal/pedidos/5...): siempre index.html
export function paginas(req, res, next) {
  if (!['GET', 'HEAD'].includes(req.method) || req.path === '/api' || req.path.startsWith('/api/') || req.path.startsWith('/assets/')) {
    return next()
  }
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(path.join(CARPETA, 'index.html'))
}
