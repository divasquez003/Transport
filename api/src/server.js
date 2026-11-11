import { app } from './app.js'
import { prepararBaseDeDatos } from './bd-inicial.js'
import { config } from './config.js'
import { pool } from './db.js'
import { detenerTareas, iniciarTareas } from './jobs/index.js'

await prepararBaseDeDatos()

const servidor = app.listen(config.puerto, () => {
  console.log(`${config.nombre} escuchando en el puerto ${config.puerto}`)
  if (config.tareas) iniciarTareas()
})

// Docker envía SIGTERM al detener el contenedor: se cierran las conexiones con calma
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    detenerTareas()
    servidor.close(() => pool.end().finally(() => process.exit(0)))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
