import { aCsv } from '../lib/csv.js'
import { enviarCsv, id, invalido, noEncontrado, ok, prohibido } from '../lib/http.js'
import { diasEntre, hoy, redondear, sumarDias } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { esCentral, esCliente, giroDe, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Clientes from '../models/clientes.js'
import * as Inventario from '../models/inventario.js'
import * as Reportes from '../models/reportes.js'
import { conPlazo } from '../services/proyectos.js'

// ?desde=&hasta= o ?anio=&mes=; por defecto, el mes en curso hasta hoy
function periodo(query, mesesPorDefecto = 0) {
  const f = validar(query, { desde: 'fecha', hasta: 'fecha', anio: 'entero|hasta:2100', mes: 'entero|positivo|hasta:12' })
  if (f.anio && f.anio < 2020) throw invalido({ anio: 'Año no válido' })
  let desde = f.desde
  let hasta = f.hasta
  const anio = f.anio ?? (f.mes ? Number(hoy().slice(0, 4)) : null)
  if (!desde && anio) {
    const dos = (n) => String(n).padStart(2, '0')
    if (f.mes) {
      desde = `${anio}-${dos(f.mes)}-01`
      hasta ??= sumarDias(f.mes === 12 ? `${anio + 1}-01-01` : `${anio}-${dos(f.mes + 1)}-01`, -1)
    } else {
      desde = `${anio}-01-01`
      hasta ??= `${anio}-12-31`
    }
  }
  hasta ??= hoy()
  desde ??= mesesPorDefecto ? sumarDias(hasta, -30 * mesesPorDefecto) : `${hasta.slice(0, 7)}-01`
  if (desde > hasta) throw invalido({ desde: 'Debe ser anterior o igual a hasta' })
  if (diasEntre(desde, hasta) > 731) throw invalido({ hasta: 'El periodo máximo es de 2 años' })
  return { desde, hasta }
}

const de = (lista, giroId) => lista.find((x) => x.giro_id === giroId) ?? {}

// Une los indicadores de cada consulta en una fila por giro
function combinar(giro, ind) {
  const ventas = de(ind.pedidos, giro.id).ventas ?? 0
  const alquileres = de(ind.alquileres, giro.id).ingresos ?? 0
  const viajes = de(ind.viajes, giro.id)
  const internos = de(ind.internos, giro.id)
  const obras = de(ind.obras, giro.id).ingresos ?? 0
  const ingresos = redondear(ventas + alquileres + (viajes.ingresos ?? 0) + obras)
  const ingresosInternos = redondear((internos.ventas_internas ?? 0) + (viajes.ingresos_internos ?? 0))
  const gastos = de(ind.gastos, giro.id).gastos ?? 0
  const presupuesto = de(ind.presupuestos, giro.id).presupuesto ?? 0
  return {
    giro_id: giro.id,
    giro: giro.nombre,
    codigo: giro.codigo,
    pedidos: de(ind.pedidos, giro.id).pedidos ?? 0,
    ventas,
    alquileres: de(ind.alquileres, giro.id).alquileres ?? 0,
    ingresos_alquileres: alquileres,
    viajes: viajes.viajes ?? 0,
    ingresos_viajes: redondear((viajes.ingresos ?? 0) + (viajes.ingresos_internos ?? 0)),
    ingresos_obras: redondear(obras),
    ingresos,
    ingresos_internos: ingresosInternos,
    gastos,
    resultado: redondear(ingresos + ingresosInternos - gastos),
    presupuesto,
    ejecucion_presupuesto: presupuesto ? redondear((gastos / presupuesto) * 100) : null,
    pedidos_abiertos: de(ind.pendientes, giro.id).pedidos_abiertos ?? 0,
    productos_bajo_minimo: de(ind.bajoMinimo, giro.id).productos_bajo_minimo ?? 0,
    proyectos_en_ejecucion: de(ind.proyectos, giro.id).proyectos_en_ejecucion ?? 0,
    cartera_proyectos: de(ind.proyectos, giro.id).cartera_proyectos ?? 0
  }
}

// Puntos de atención para la toma de decisiones
function observaciones(filas) {
  const lista = []
  for (const g of filas) {
    // Mismos umbrales que las alertas de presupuesto: 80 % y 100 %
    if (g.ejecucion_presupuesto >= 100) lista.push(`${g.giro} superó su presupuesto del periodo (${g.ejecucion_presupuesto} %).`)
    else if (g.ejecucion_presupuesto >= 80) lista.push(`${g.giro} ya ejecutó el ${g.ejecucion_presupuesto} % de su presupuesto del periodo.`)
    if (g.productos_bajo_minimo) lista.push(`${g.giro} tiene ${g.productos_bajo_minimo} producto(s) bajo la existencia mínima.`)
    if (g.resultado < 0) lista.push(`${g.giro} tiene un resultado negativo en el periodo.`)
  }
  return lista
}

async function consolidadoDatos(r) {
  const [giros, ind] = await Promise.all([Catalogo.listarGiros(), Reportes.indicadoresPorGiro(r)])
  const filas = giros.map((g) => combinar(g, ind))
  const suma = (campo) => redondear(filas.reduce((s, f) => s + f[campo], 0))
  // En el consolidado las ventas entre giros se eliminan: solo cuentan los ingresos de clientes
  const totales = {
    ingresos: suma('ingresos'),
    gastos: suma('gastos'),
    resultado: redondear(suma('ingresos') - suma('gastos')),
    presupuesto: suma('presupuesto'),
    pedidos: suma('pedidos'),
    pedidos_abiertos: suma('pedidos_abiertos'),
    productos_bajo_minimo: suma('productos_bajo_minimo')
  }
  totales.ejecucion_presupuesto = totales.presupuesto ? redondear((totales.gastos / totales.presupuesto) * 100) : null
  return { filas, totales }
}

// Vista de la sede central: todos los giros en una sola tabla
export async function consolidado(req, res) {
  const r = periodo(req.query)
  const { filas, totales } = await consolidadoDatos(r)
  ok(res, { periodo: r, giros: filas, totales, tendencia_ventas: await Reportes.ventasPorMes(6), observaciones: observaciones(filas) })
}

// Reporte de un giro: indicadores, clientes, productos, gastos y datos propios de su operación
export async function giro(req, res) {
  const giroId = id(req)
  const datosGiro = await Catalogo.buscarGiro(giroId)
  if (!datosGiro) throw noEncontrado('Giro de negocio')
  if (!puedeVerGiro(req.usuario, giroId)) throw prohibido('Solo puede ver el reporte de su giro de negocio')
  const r = periodo(req.query)
  const [ind, porMes, clientes, productos, gastos, inventario] = await Promise.all([
    Reportes.indicadoresPorGiro(r, giroId),
    Reportes.ventasPorMes(6, giroId),
    Reportes.topClientes(r, giroId),
    Reportes.ventas(r, giroId, 'producto'),
    Reportes.gastosPorCategoria(r, giroId),
    Reportes.inventarioDeGiro(giroId)
  ])
  const especifico = {}
  if (datosGiro.codigo === 'MINERIA') especifico.extraccion = await Reportes.extraccion(r, giroId)
  if (datosGiro.codigo === 'PROCESO') especifico.ordenes_produccion = await Reportes.ordenesProduccion(giroId)
  if (datosGiro.codigo === 'MAQUINARIA') {
    const dias = diasEntre(r.desde, r.hasta) + 1
    especifico.utilizacion_maquinas = (await Reportes.utilizacionMaquinas(r, giroId))
      .map((m) => ({ ...m, utilizacion: redondear((Math.min(m.dias_alquilada, dias) / dias) * 100) }))
  }
  if (['TRANSP_MP', 'TRANSP_PROD'].includes(datosGiro.codigo)) especifico.viajes_por_ruta = await Reportes.viajesPorRuta(r, giroId)
  if (datosGiro.codigo === 'CONSTRUCCION') especifico.proyectos = (await Reportes.proyectosDeGiro(giroId)).map(conPlazo)
  const indicadores = combinar(datosGiro, ind)
  ok(res, {
    giro: { id: datosGiro.id, codigo: datosGiro.codigo, nombre: datosGiro.nombre },
    periodo: r,
    indicadores,
    observaciones: observaciones([indicadores]),
    ventas_por_mes: porMes,
    top_clientes: clientes,
    ventas_por_producto: productos.slice(0, 10),
    gastos_por_categoria: gastos,
    inventario,
    ...especifico
  })
}

// ?agrupar=mes|dia|giro|producto|cliente|vendedor
export async function ventas(req, res) {
  const r = periodo(req.query)
  const f = validar(req.query, { giro_id: 'entero', agrupar: `en:${Reportes.AGRUPAR}` })
  const agrupar = f.agrupar ?? 'mes'
  const filas = await Reportes.ventas(r, giroDe(req.usuario, f.giro_id), agrupar)
  ok(res, filas, { periodo: r, agrupar, total: redondear(filas.reduce((s, x) => s + x.total, 0)) })
}

export async function presupuesto(req, res) {
  const f = validar(req.query, { anio: 'entero|hasta:2100', giro_id: 'entero' })
  const anio = f.anio ?? Number(hoy().slice(0, 4))
  const giroId = giroDe(req.usuario, f.giro_id)
  const [meses, categorias] = await Promise.all([
    Reportes.presupuestoAnual(anio, giroId),
    Reportes.gastosPorCategoria({ desde: `${anio}-01-01`, hasta: `${anio}-12-31` }, giroId)
  ])
  const total = (campo) => redondear(meses.reduce((s, m) => s + m[campo], 0))
  ok(res, {
    anio,
    meses,
    gastos_por_categoria: categorias,
    totales: { presupuesto: total('presupuesto'), gastado: total('gastado'), disponible: total('disponible') }
  })
}

// Relación comercial del cliente con la corporación (el cliente solo ve la suya; el personal, lo de su giro)
export async function cliente(req, res) {
  const clienteId = id(req)
  if (esCliente(req.usuario) && req.usuario.cliente_id !== clienteId) throw noEncontrado('Cliente')
  if (!esCliente(req.usuario) && req.usuario.rol === 'operativo') throw prohibido('Su rol no tiene permiso para esta acción')
  const datos = await Clientes.basico(clienteId)
  if (!datos) throw noEncontrado('Cliente')
  const r = periodo(req.query, 12)
  const giroId = esCliente(req.usuario) || esCentral(req.usuario) ? null : req.usuario.giro_id
  const resumen = await Reportes.resumenCliente(clienteId, r, giroId)
  ok(res, {
    cliente: datos,
    periodo: r,
    total_pedidos: redondear(resumen.porGiroNegocio.reduce((s, g) => s + g.total, 0)),
    por_giro: resumen.porGiroNegocio,
    por_mes: resumen.porMes,
    ultimos_pedidos: resumen.ultimos,
    alquileres: resumen.alquileres,
    viajes: resumen.viajes,
    proyectos: resumen.proyectos
  })
}

// ------------------------------------------------------------------ exportación a CSV (Excel)

const EXPORTACIONES = {
  async consolidado(req, r) {
    if (!esCentral(req.usuario)) throw prohibido('El consolidado es exclusivo de la sede central')
    const { filas } = await consolidadoDatos(r)
    return aCsv(filas, [
      { titulo: 'Giro', campo: 'giro' }, { titulo: 'Pedidos', campo: 'pedidos' }, { titulo: 'Ventas', campo: 'ventas' },
      { titulo: 'Ingresos alquileres', campo: 'ingresos_alquileres' }, { titulo: 'Ingresos viajes', campo: 'ingresos_viajes' },
      { titulo: 'Avance de obras', campo: 'ingresos_obras' },
      { titulo: 'Ingresos', campo: 'ingresos' }, { titulo: 'Ingresos internos', campo: 'ingresos_internos' },
      { titulo: 'Gastos', campo: 'gastos' }, { titulo: 'Resultado', campo: 'resultado' }, { titulo: 'Presupuesto', campo: 'presupuesto' },
      { titulo: '% ejecutado', campo: 'ejecucion_presupuesto' }, { titulo: 'Pedidos abiertos', campo: 'pedidos_abiertos' },
      { titulo: 'Productos bajo mínimo', campo: 'productos_bajo_minimo' }
    ])
  },
  async ventas(req, r) {
    const f = validar(req.query, { giro_id: 'entero', agrupar: `en:${Reportes.AGRUPAR}` })
    const filas = await Reportes.ventas(r, giroDe(req.usuario, f.giro_id), f.agrupar ?? 'mes')
    return aCsv(filas, [
      { titulo: 'Agrupación', campo: 'etiqueta' }, { titulo: 'Pedidos', campo: 'pedidos' },
      { titulo: 'Cantidad', campo: 'cantidad' }, { titulo: 'Total', campo: 'total' }
    ])
  },
  async presupuesto(req) {
    const f = validar(req.query, { anio: 'entero|hasta:2100', giro_id: 'entero' })
    const filas = await Reportes.presupuestoAnual(f.anio ?? Number(hoy().slice(0, 4)), giroDe(req.usuario, f.giro_id))
    return aCsv(filas, [
      { titulo: 'Giro', campo: 'giro' }, { titulo: 'Mes', campo: 'mes' }, { titulo: 'Presupuesto', campo: 'presupuesto' },
      { titulo: 'Gastado', campo: 'gastado' }, { titulo: 'Disponible', campo: 'disponible' }, { titulo: '% ejecutado', campo: 'porcentaje' }
    ])
  },
  async inventario(req) {
    const f = validar(req.query, { giro_id: 'entero' })
    const filas = await Inventario.existencias({ giro_id: giroDe(req.usuario, f.giro_id) })
    return aCsv(filas, [
      { titulo: 'Sede', campo: 'sede' }, { titulo: 'Código', campo: 'codigo' }, { titulo: 'Producto', campo: 'producto' },
      { titulo: 'Unidad', campo: 'unidad_medida' }, { titulo: 'Existencia', campo: 'cantidad' }, { titulo: 'Mínimo', campo: 'minimo' },
      { titulo: 'Bajo mínimo', campo: (e) => (e.bajo_minimo ? 'Sí' : 'No') }
    ])
  }
}

// ?reporte=consolidado|ventas|presupuesto|inventario (se abre directo en Excel)
export async function exportar(req, res) {
  const f = validar(req.query, { reporte: `requerido|en:${Object.keys(EXPORTACIONES).join(',')}` })
  const r = periodo(req.query)
  const contenido = await EXPORTACIONES[f.reporte](req, r)
  enviarCsv(res, `reporte_${f.reporte}_${r.desde}_${r.hasta}.csv`, contenido)
}
