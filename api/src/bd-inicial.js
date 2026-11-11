import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { config } from './config.js'

// Los scripts de database/ solo están cuando se despliega el proyecto completo, por ejemplo en Railway.
// En Docker la base se crea desde el contenedor de MySQL (comandos.txt) y esta parte no se activa.
const CARPETA = fileURLToPath(new URL('../../database/', import.meta.url))
const SCRIPTS = ['01_esquema.sql', '02_datos_demo.sql']
const BASE = 'transport_db'
const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function conectar() {
  const { host, port, user, password } = config.db
  for (let intento = 1; ; intento++) {
    try {
      return await mysql.createConnection({ host, port, user, password, charset: 'utf8mb4', multipleStatements: true, connectTimeout: 5000 })
    } catch (error) {
      if (intento === 10) throw error
      await espera(3000)
    }
  }
}

// Crea transport_db con los datos de demostración si todavía no tiene tablas.
// Con REINICIAR_BD=1 la vuelve a crear en cada arranque (quitar la variable después).
export async function prepararBaseDeDatos() {
  if (!SCRIPTS.every((script) => existsSync(CARPETA + script))) return
  if (config.db.database !== BASE) {
    console.warn(`[base de datos] DB_NAME es ${config.db.database}; los scripts crean ${BASE}, no se cargan`)
    return
  }
  const reiniciar = ['1', 'si', 'sí', 'true'].includes(String(process.env.REINICIAR_BD ?? '').trim().toLowerCase())
  let conexion
  try {
    conexion = await conectar()
    const [[{ tablas }]] = await conexion.query('SELECT COUNT(*) AS tablas FROM information_schema.tables WHERE table_schema = ?', [BASE])
    if (tablas > 0 && !reiniciar) return
    console.log(`[base de datos] ${tablas > 0 ? 'reiniciando' : 'creando'} ${BASE} con los datos de demostración`)
    for (const script of SCRIPTS) await conexion.query(await readFile(CARPETA + script, 'utf8'))
    console.log(`[base de datos] ${BASE} lista${reiniciar ? '; quite la variable REINICIAR_BD para no reiniciarla en el próximo arranque' : ''}`)
  } catch (error) {
    console.error(`[base de datos] no se pudo preparar ${BASE}: ${error.message}`)
  } finally {
    await conexion?.end()
  }
}
