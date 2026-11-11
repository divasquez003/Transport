import { AsyncLocalStorage } from 'node:async_hooks'
import mysql from 'mysql2/promise'
import { config } from './config.js'

export const pool = mysql.createPool({
  ...config.db,
  charset: 'utf8mb4',
  timezone: '-06:00',
  dateStrings: true,
  decimalNumbers: true,
  connectionLimit: 10,
  connectTimeout: 5000,
  // TINYINT(1) se devuelve como true/false
  typeCast(campo, siguiente) {
    if (campo.type === 'TINY' && campo.length === 1) {
      const valor = campo.string()
      return valor === null ? null : valor === '1'
    }
    return siguiente()
  }
})

// Guatemala no tiene horario de verano: NOW() y CURDATE() siempre en UTC-6
pool.on('connection', (conexion) => {
  conexion.query("SET time_zone = '-06:00'")
})

// Si hay una transacción en curso, todas las consultas usan su conexión
const contexto = new AsyncLocalStorage()

export async function consulta(sql, parametros = []) {
  const conexion = contexto.getStore()?.conexion ?? pool
  const [resultado] = await conexion.query(sql, parametros)
  return resultado
}

export async function uno(sql, parametros = []) {
  const filas = await consulta(sql, parametros)
  return filas[0] ?? null
}

export async function valor(sql, parametros = []) {
  const fila = await uno(sql, parametros)
  return fila ? Object.values(fila)[0] : null
}

export async function insertar(sql, parametros = []) {
  const resultado = await consulta(sql, parametros)
  return resultado.insertId
}

export async function transaccion(bloque) {
  if (contexto.getStore()) return bloque()
  const conexion = await pool.getConnection()
  const tareas = []
  try {
    await conexion.beginTransaction()
    const resultado = await contexto.run({ conexion, tareas }, bloque)
    await conexion.commit()
    tareas.forEach(enSegundoPlano)
    return resultado
  } catch (error) {
    await conexion.rollback().catch(() => {})
    throw error
  } finally {
    conexion.release()
  }
}

// Efectos externos (push, webhooks): solo se ejecutan si la transacción se confirma
export function despues(tarea) {
  const actual = contexto.getStore()
  if (actual) actual.tareas.push(tarea)
  else enSegundoPlano(tarea)
}

function enSegundoPlano(tarea) {
  setImmediate(() => {
    Promise.resolve().then(tarea).catch((error) => console.error('[segundo plano]', error.message))
  })
}

// Arma el WHERE solo con las condiciones que traen valor: [['p.giro_id = ?', 2], ['p.activo = 1']]
export function donde(condiciones) {
  const partes = []
  const parametros = []
  for (const [sql, ...valores] of condiciones) {
    if (valores.some((v) => v === undefined || v === null || v === '')) continue
    partes.push(sql)
    parametros.push(...valores)
  }
  return { sql: partes.length ? `WHERE ${partes.join(' AND ')}` : '', parametros }
}

// Devuelve [filas, total] usando la misma condición para contar y listar
export async function paginar({ seleccion, origen, filtro, orden, pag }) {
  const total = Number(await valor(`SELECT COUNT(*) ${origen} ${filtro.sql}`, filtro.parametros))
  const filas = await consulta(
    `SELECT ${seleccion} ${origen} ${filtro.sql} ORDER BY ${orden} LIMIT ? OFFSET ?`,
    [...filtro.parametros, pag.porPagina, pag.desde]
  )
  return [filas, total]
}

export function marcas(lista) {
  return lista.map(() => '?').join(', ')
}

// UPDATE solo de los campos permitidos que vienen en datos
export async function actualizarCampos(tabla, id, datos, permitidos) {
  const campos = permitidos.filter((campo) => campo in datos)
  if (!campos.length) return 0
  const resultado = await consulta(
    `UPDATE ${tabla} SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...campos.map((c) => datos[c]), id]
  )
  return resultado.affectedRows
}
