import { creado, invalido, ok, paginacion, paginado } from '../lib/http.js'
import { redondear } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { giroDe } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Operaciones from '../models/operaciones.js'
import * as FinanzasService from '../services/finanzas.js'

// ------------------------------------------------------------------ presupuestos

// Presupuesto contra lo gastado; cada giro ve el suyo y la sede central todos
export async function listarPresupuestos(req, res) {
  const f = validar(req.query, { giro_id: 'entero', anio: 'entero|hasta:2100', mes: 'entero|positivo|hasta:12' })
  const filas = await Operaciones.listarPresupuestos({ ...f, giro_id: giroDe(req.usuario, f.giro_id) })
  // El resumen suma solo los presupuestos generales (los de categoría ya están incluidos en ellos)
  const generales = filas.filter((p) => p.categoria === 'general')
  const monto = redondear(generales.reduce((s, p) => s + p.monto, 0))
  const gastado = redondear(generales.reduce((s, p) => s + p.gastado, 0))
  ok(res, filas, { resumen: { presupuesto: monto, gastado, disponible: redondear(monto - gastado), porcentaje: monto ? redondear((gastado / monto) * 100) : null } })
}

// Crea o reemplaza el presupuesto de un giro para un mes (categoria "general" cubre todos los gastos)
export async function guardarPresupuesto(req, res) {
  const datos = validar(req.body, {
    giro_id: 'requerido|entero',
    anio: 'requerido|entero|hasta:2100',
    mes: 'requerido|entero|positivo|hasta:12',
    categoria: 'texto|max:60',
    monto: 'requerido|numero|positivo|hasta:99999999999'
  })
  if (datos.anio < 2020) throw invalido({ anio: 'Año no válido' })
  if (!(await Catalogo.buscarGiro(datos.giro_id))) throw invalido({ giro_id: 'El giro de negocio no existe' })
  const categoria = datos.categoria ? FinanzasService.categoria(datos.categoria) : 'general'
  await Operaciones.guardarPresupuesto({ ...datos, categoria })
  creado(res, await Operaciones.buscarPresupuesto(datos.giro_id, datos.anio, datos.mes, categoria), 'Presupuesto guardado')
}

// ------------------------------------------------------------------ gastos

export async function listarGastos(req, res) {
  const f = validar(req.query, { giro_id: 'entero', sede_id: 'entero', categoria: 'texto|max:60', desde: 'fecha', hasta: 'fecha' })
  if (f.categoria) f.categoria = FinanzasService.categoria(f.categoria)
  const pag = paginacion(req.query, 30)
  const [filas, total, suma] = await Operaciones.listarGastos({ ...f, giro_id: giroDe(req.usuario, f.giro_id) }, pag)
  paginado(res, filas, total, pag, { total_monto: suma })
}

export async function crearGasto(req, res) {
  creado(res, await FinanzasService.crearGasto(req.usuario, req.body), 'Gasto registrado')
}
