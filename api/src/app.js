import express from 'express'
import { config } from './config.js'
import * as Salud from './controllers/salud.js'
import { manejarErrores } from './middlewares/errores.js'
import { router, rutaNoEncontrada } from './routes.js'
import { archivos, hayWeb, paginas } from './web.js'

export const app = express()

app.disable('x-powered-by')
app.set('json spaces', 2)
app.set('trust proxy', true)

// CORS: la web usa el mismo origen (nginx reenvía /api), pero se permite llamar la API desde otros orígenes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigen)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-GPS-Token')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: false }))
app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }))
app.use((req, res, next) => {
  req.body ??= {}
  next()
})

app.use('/api', router)
if (hayWeb) {
  app.use(archivos)
  app.use(paginas)
} else {
  app.get('/', Salud.inicio)
}
app.use(rutaNoEncontrada)
app.use(manejarErrores)
