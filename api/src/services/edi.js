import { leerCsv } from '../lib/csv.js'
import { invalido, prohibido } from '../lib/http.js'
import { esCentral, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Clientes from '../models/clientes.js'
import * as Integraciones from '../models/integraciones.js'
import * as FinanzasService from './finanzas.js'
import * as InventarioService from './inventario.js'
import * as PedidoService from './pedidos.js'

export const TIPOS_IMPORTACION = ['pedidos', 'gastos', 'inventario']
const MAXIMO_FILAS = 1000

// Columnas obligatorias de cada archivo (las demás son opcionales)
export const COLUMNAS = {
  pedidos: ['referencia', 'nit', 'codigo_producto', 'cantidad'],
  gastos: ['fecha', 'categoria', 'descripcion', 'monto'],
  inventario: ['sede_id', 'codigo_producto', 'cantidad']
}

const textoError = (error) => (error.errores && Object.keys(error.errores).length ? Object.values(error.errores).join('; ') : error.message)
const numero = (texto) => Number(String(texto ?? '').replace(/\s/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, ''))

// Ejecuta cada registro por separado: los que fallan se reportan y los demás se importan
async function procesar(registros, tarea) {
  const errores = []
  let importados = 0
  const creados = []
  for (const { fila, referencia, datos } of registros) {
    try {
      const resultado = await tarea(datos)
      importados++
      if (resultado) creados.push(resultado)
    } catch (error) {
      if (!error.estado && !error.sqlMessage) console.error('[edi]', error)
      errores.push({ fila, ...(referencia && { referencia }), mensaje: error.estado || error.sqlMessage ? textoError(error) : 'Error interno al importar la fila' })
    }
  }
  return { importados, errores, creados }
}

// Pedidos: las filas con la misma referencia forman un pedido (un cliente, productos de un mismo giro)
async function importarPedidos(usuario, filas, archivo) {
  const grupos = new Map()
  const errores = []
  const productosPorCodigo = new Map()
  for (const [i, fila] of filas.entries()) {
    const numeroFila = i + 2
    const referencia = fila.referencia || `fila-${numeroFila}`
    const codigo = String(fila.codigo_producto ?? '').toUpperCase()
    if (!productosPorCodigo.has(codigo)) productosPorCodigo.set(codigo, await Catalogo.productoPorCodigo(codigo))
    const producto = productosPorCodigo.get(codigo)
    const cantidad = numero(fila.cantidad)
    if (!producto) {
      errores.push({ fila: numeroFila, referencia, mensaje: `Producto ${codigo || '(vacío)'} no existe` })
      continue
    }
    if (!(cantidad > 0)) {
      errores.push({ fila: numeroFila, referencia, mensaje: 'La cantidad debe ser mayor que cero' })
      continue
    }
    if (!grupos.has(referencia)) {
      grupos.set(referencia, { fila: numeroFila, referencia, nit: String(fila.nit ?? '').toUpperCase(), fila_datos: fila, items: [] })
    }
    grupos.get(referencia).items.push({ producto_id: producto.id, cantidad })
  }
  const registros = []
  for (const grupo of grupos.values()) {
    const cliente = grupo.nit ? await Clientes.porNit(grupo.nit) : null
    if (!cliente) {
      errores.push({ fila: grupo.fila, referencia: grupo.referencia, mensaje: `No hay un cliente con NIT ${grupo.nit || '(vacío)'}` })
      continue
    }
    const f = grupo.fila_datos
    registros.push({
      fila: grupo.fila,
      referencia: grupo.referencia,
      datos: {
        cliente_id: cliente.id,
        items: grupo.items,
        ...(f.sede_id && { sede_id: f.sede_id }),
        ...(f.fecha_entrega && { fecha_entrega: f.fecha_entrega }),
        ...(f.direccion_entrega && { direccion_entrega: f.direccion_entrega }),
        observaciones: `Importado de ${archivo} (referencia ${grupo.referencia})`.slice(0, 500)
      }
    })
  }
  const resultado = await procesar(registros, async (datos) => (await PedidoService.crear(usuario, datos)).codigo)
  return { ...resultado, errores: [...errores, ...resultado.errores].sort((a, b) => a.fila - b.fila) }
}

function importarGastos(usuario, filas) {
  const registros = filas.map((f, i) => ({
    fila: i + 2,
    referencia: f.documento || null,
    datos: {
      ...(f.giro_id && { giro_id: f.giro_id }),
      ...(f.sede_id && { sede_id: f.sede_id }),
      fecha: f.fecha,
      categoria: f.categoria,
      descripcion: f.descripcion,
      monto: numero(f.monto),
      ...(f.documento && { documento: f.documento })
    }
  }))
  return procesar(registros, async (datos) => (await FinanzasService.crearGasto(usuario, datos)).id)
}

// Conteo físico: la cantidad del archivo reemplaza la existencia (movimiento de ajuste)
function importarInventario(usuario, filas, archivo) {
  const registros = filas.map((f, i) => ({ fila: i + 2, referencia: f.codigo_producto, datos: f }))
  return procesar(registros, async (f) => {
    const sede = await Catalogo.buscarSede(Number(f.sede_id) || 0)
    if (!sede?.giro_id) throw invalido({ sede_id: `La sede ${f.sede_id} no existe` })
    if (!puedeVerGiro(usuario, sede.giro_id)) throw prohibido(`La sede ${sede.nombre} es de otro giro`)
    const producto = await Catalogo.productoPorCodigo(String(f.codigo_producto).toUpperCase())
    if (!producto || !Catalogo.llevaInventario(producto)) throw invalido({ codigo_producto: `${f.codigo_producto} no existe o no lleva inventario` })
    const cantidad = numero(f.cantidad)
    if (!(cantidad >= 0)) throw invalido({ cantidad: 'La cantidad no puede ser negativa' })
    await InventarioService.mover({ sedeId: sede.id, productoId: producto.id, tipo: 'ajuste', cantidad, referencia: `Conteo ${archivo}`.slice(0, 60), usuarioId: usuario.id })
    return null
  })
}

export async function importar(usuario, { tipo, contenido, archivo }) {
  const filas = leerCsv(contenido)
  if (!filas.length) throw invalido({ contenido: 'El archivo no tiene filas de datos (la primera fila debe ser el encabezado)' })
  if (filas.length > MAXIMO_FILAS) throw invalido({ contenido: `Máximo ${MAXIMO_FILAS} filas por archivo` })
  const faltantes = COLUMNAS[tipo].filter((c) => !(c in filas[0]))
  if (faltantes.length) throw invalido({ contenido: `Faltan columnas: ${faltantes.join(', ')}. Columnas requeridas: ${COLUMNAS[tipo].join(', ')}` })
  if (tipo === 'gastos' && esCentral(usuario) && !('giro_id' in filas[0])) throw invalido({ contenido: 'La sede central debe incluir la columna giro_id' })

  const tareas = { pedidos: importarPedidos, gastos: importarGastos, inventario: importarInventario }
  const resultado = await tareas[tipo](usuario, filas, archivo)
  await Integraciones.bitacora({
    tipo: 'edi_importacion',
    referencia: `${tipo}: ${archivo}`,
    estado: resultado.importados ? 'exitoso' : 'fallido',
    detalle: `${resultado.importados} ${tipo} importados de ${filas.length} filas por ${usuario.nombre}${resultado.errores.length ? `; ${resultado.errores.length} con error` : ''}`
  })
  return { tipo, archivo, filas: filas.length, importados: resultado.importados, creados: resultado.creados, errores: resultado.errores }
}
