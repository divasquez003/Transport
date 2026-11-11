import { transaccion } from '../db.js'
import { conflicto, invalido, noEncontrado, prohibido } from '../lib/http.js'
import { cantidad, conUnidad, estado as etiqueta, hoy, horaActual, redondear } from '../lib/formato.js'
import { validar, validarItems } from '../lib/validar.js'
import { puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Operaciones from '../models/operaciones.js'
import * as AlertaService from './alertas.js'
import * as InventarioService from './inventario.js'

const FLUJO = {
  planificada: ['en_proceso', 'cancelada'],
  en_proceso: ['finalizada', 'cancelada'],
  finalizada: [],
  cancelada: []
}

// La sede debe ser del tipo indicado y de un giro que el usuario puede ver
async function sedeDeTrabajo(usuario, sedeId, tipo, campo = 'sede_id') {
  const sede = await Catalogo.buscarSede(sedeId ?? 0)
  if (!sede?.activo || sede.tipo !== tipo) {
    const nombre = tipo === 'planta_extraccion' ? 'una planta de extracción' : 'una planta de proceso'
    throw invalido({ [campo]: `Debe ser ${nombre}` })
  }
  if (!puedeVerGiro(usuario, sede.giro_id)) throw prohibido('Solo puede registrar producción de las sedes de su giro')
  return sede
}

// ------------------------------------------------------------------ extracción minera (por turno)

export async function registrarExtraccion(usuario, entrada) {
  const datos = validar(entrada, {
    sede_id: 'entero',
    producto_id: 'requerido|entero',
    fecha: 'fecha',
    turno: 'en:diurno,nocturno',
    cantidad: 'requerido|numero|positivo|hasta:100000',
    observaciones: 'texto|max:255'
  })
  // El operador registra en su propia planta si no indica otra
  const sede = await sedeDeTrabajo(usuario, datos.sede_id ?? usuario.sede_id, 'planta_extraccion')
  const producto = await Catalogo.buscarProducto(datos.producto_id, true)
  if (!producto || producto.tipo !== 'materia_prima' || producto.giro_id !== sede.giro_id) {
    throw invalido({ producto_id: 'Debe ser una materia prima del giro de la planta' })
  }
  const fecha = datos.fecha ?? hoy()
  if (fecha > hoy()) throw invalido({ fecha: 'No puede ser una fecha futura' })
  const turno = datos.turno ?? (horaActual() >= 6 && horaActual() < 18 ? 'diurno' : 'nocturno')

  return transaccion(async () => {
    const registroId = await Operaciones.crearExtraccion({ ...datos, sede_id: sede.id, fecha, turno, registrado_por: usuario.id })
    // Lo extraído entra al inventario de la planta
    const movimiento = await InventarioService.mover({
      sedeId: sede.id,
      productoId: producto.id,
      tipo: 'entrada',
      cantidad: datos.cantidad,
      referencia: `Extracción ${fecha} turno ${turno}`,
      usuarioId: usuario.id
    })
    return {
      id: registroId,
      sede_id: sede.id,
      sede: sede.nombre,
      producto_id: producto.id,
      producto: producto.nombre,
      unidad_medida: producto.unidad_medida,
      fecha,
      turno,
      cantidad: datos.cantidad,
      existencia_nueva: movimiento.nueva
    }
  })
}

// ------------------------------------------------------------------ órdenes de producción (plantas de proceso)

export async function crearOrden(usuario, entrada) {
  const datos = validar(entrada, {
    sede_id: 'requerido|entero',
    producto_id: 'requerido|entero',
    cantidad_planificada: 'requerido|numero|positivo|hasta:10000000',
    fecha_inicio: 'fecha'
  })
  const sede = await sedeDeTrabajo(usuario, datos.sede_id, 'planta_proceso')
  const producto = await Catalogo.buscarProducto(datos.producto_id, true)
  if (!producto?.activo || producto.tipo !== 'producto' || producto.giro_id !== sede.giro_id) {
    throw invalido({ producto_id: 'Debe ser un producto activo que fabrique el giro de la planta' })
  }
  const fechaInicio = datos.fecha_inicio ?? hoy()
  if (fechaInicio < hoy()) throw invalido({ fecha_inicio: 'No puede ser una fecha pasada' })
  const ordenId = await Operaciones.crearOrden({ ...datos, fecha_inicio: fechaInicio, creado_por: usuario.id })
  return Operaciones.buscarOrden(ordenId)
}

// Registra avance de producción (entra al inventario), consumo de materia prima (sale) o cambia el estado
export async function actualizarOrden(usuario, ordenId, entrada) {
  const datos = validar(entrada, {
    estado: `en:${Operaciones.ESTADOS_ORDEN}`,
    cantidad: 'numero|positivo|hasta:10000000',
    consumos: 'arreglo',
    comentario: 'texto|max:255'
  })
  if (!datos.estado && !datos.cantidad) throw invalido({}, 'Envíe el estado o la cantidad producida')
  const orden = await Operaciones.buscarOrden(ordenId)
  if (!orden) throw noEncontrado('Orden de producción', 'a')
  if (!puedeVerGiro(usuario, orden.giro_id)) throw prohibido('La orden pertenece a otro giro de negocio')
  if (datos.consumos && !datos.cantidad) throw invalido({ consumos: 'Registre los consumos junto con la cantidad producida' })

  // Registrar producción en una orden planificada la inicia
  let nuevo = datos.estado ?? orden.estado
  if (datos.cantidad && orden.estado === 'planificada' && !datos.estado) nuevo = 'en_proceso'
  if (nuevo !== orden.estado && !FLUJO[orden.estado].includes(nuevo)) {
    const opciones = FLUJO[orden.estado].join(', ') || 'ninguno (estado final)'
    throw conflicto(`No se puede pasar de '${orden.estado}' a '${nuevo}'. Estados permitidos: ${opciones}`)
  }
  if (datos.cantidad && !['en_proceso', 'finalizada'].includes(nuevo)) throw conflicto(`No se puede registrar producción en una orden ${etiqueta(nuevo)}`)
  if (datos.cantidad && orden.estado === 'finalizada') throw conflicto('La orden ya está finalizada')
  if (nuevo === 'cancelada' && !datos.comentario) throw invalido({ comentario: 'Indique el motivo de la cancelación' })
  const consumos = datos.consumos ? validarItems(datos.consumos) : new Map()
  const materias = await Catalogo.productosPorIds([...consumos.keys()])
  for (const productoId of consumos.keys()) {
    if (materias.get(productoId)?.tipo !== 'materia_prima') throw invalido({ consumos: `El producto ${productoId} no es materia prima` })
  }

  await transaccion(async () => {
    const cambios = {}
    if (nuevo !== orden.estado) cambios.estado = nuevo
    if (nuevo === 'finalizada') cambios.fecha_fin = hoy()
    if (datos.cantidad) {
      cambios.cantidad_producida = redondear(orden.cantidad_producida + datos.cantidad)
      await InventarioService.mover({
        sedeId: orden.sede_id,
        productoId: orden.producto_id,
        tipo: 'entrada',
        cantidad: datos.cantidad,
        referencia: `Producción ${orden.codigo}`,
        usuarioId: usuario.id
      })
      // La materia prima usada sale del inventario de la planta (si baja del mínimo se alerta)
      for (const [productoId, usado] of consumos) {
        await InventarioService.mover({
          sedeId: orden.sede_id,
          productoId,
          tipo: 'salida',
          cantidad: usado,
          referencia: `Consumo ${orden.codigo}`,
          usuarioId: usuario.id
        })
      }
    }
    await Operaciones.actualizarOrden(orden.id, cambios)
    if (cambios.estado === 'finalizada' || cambios.estado === 'cancelada') {
      const producido = cambios.cantidad_producida ?? orden.cantidad_producida
      await AlertaService.aGiro(orden.giro_id, ['gerente', 'administrativo'], {
        tipo: `orden_${cambios.estado}`,
        titulo: `Orden ${orden.codigo} ${cambios.estado}`,
        mensaje: `${orden.producto} en ${orden.sede}: ${cantidad(producido)} de ${conUnidad(orden.cantidad_planificada, orden.unidad_medida)}${datos.comentario ? `. ${datos.comentario}` : ''}.`,
        prioridad: cambios.estado === 'cancelada' ? 'alta' : 'media',
        entidad: 'orden_produccion',
        entidad_id: orden.id
      }, usuario.id)
    }
  })
  return Operaciones.buscarOrden(orden.id)
}
