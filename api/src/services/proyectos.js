import { transaccion } from '../db.js'
import { conflicto, invalido, noEncontrado, prohibido } from '../lib/http.js'
import { diasEntre, estado as etiqueta, hoy, quetzales, redondear } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { esCentral, esCliente, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Clientes from '../models/clientes.js'
import * as Operaciones from '../models/operaciones.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from './alertas.js'

const FLUJO = {
  cotizacion: ['en_ejecucion', 'cancelado'],
  en_ejecucion: ['suspendido', 'finalizado', 'cancelado'],
  suspendido: ['en_ejecucion', 'cancelado'],
  finalizado: [],
  cancelado: []
}

// Avance esperado según el tiempo transcurrido del plazo; más de 10 puntos por debajo = atrasado
export function conPlazo(proyecto) {
  const { fecha_inicio: inicio, fecha_fin_estimada: fin } = proyecto
  if (!inicio || !fin || proyecto.estado !== 'en_ejecucion') return { ...proyecto, avance_esperado: null, situacion: etiqueta(proyecto.estado) }
  const total = Math.max(1, diasEntre(inicio, fin))
  const esperado = redondear(Math.min(100, Math.max(0, (diasEntre(inicio, hoy()) / total) * 100)))
  const diferencia = proyecto.avance_porcentaje - esperado
  return {
    ...proyecto,
    dias_restantes: diasEntre(hoy(), fin),
    avance_esperado: esperado,
    situacion: diferencia < -10 ? 'atrasado' : diferencia > 10 ? 'adelantado' : 'a tiempo'
  }
}

export function alcance(usuario) {
  if (esCliente(usuario)) return { cliente_id: usuario.cliente_id }
  return esCentral(usuario) ? {} : { giro_id: usuario.giro_id }
}

export async function obtener(usuario, proyectoId) {
  const proyecto = await Operaciones.buscarProyecto(proyectoId)
  if (!proyecto || (esCliente(usuario) && proyecto.cliente_id !== usuario.cliente_id)) throw noEncontrado('Proyecto')
  if (!esCliente(usuario) && !puedeVerGiro(usuario, proyecto.giro_id)) throw prohibido('El proyecto pertenece a otro giro de negocio')
  return proyecto
}

const REGLAS = {
  nombre: 'texto|max:150',
  tipo: `en:${Operaciones.TIPOS_PROYECTO}`,
  ubicacion: 'texto|max:200',
  monto_contrato: 'numero|no_negativo|hasta:99999999999',
  fecha_inicio: 'fecha',
  fecha_fin_estimada: 'fecha',
  responsable_id: 'entero',
  estado: `en:${Operaciones.ESTADOS_PROYECTO}`
}

async function revisar(datos, giroId, actual = {}) {
  const inicio = datos.fecha_inicio ?? actual.fecha_inicio
  const fin = datos.fecha_fin_estimada ?? actual.fecha_fin_estimada
  if (inicio && fin && fin < inicio) throw invalido({ fecha_fin_estimada: 'Debe ser posterior a la fecha de inicio' })
  if (datos.responsable_id) {
    const responsable = await Usuarios.buscarPersonal(datos.responsable_id)
    if (!responsable?.activo || responsable.giro_id !== giroId) throw invalido({ responsable_id: 'Debe ser personal activo del giro del proyecto' })
  }
}

export async function crear(usuario, entrada) {
  const central = esCentral(usuario)
  const datos = validar(entrada, {
    ...REGLAS,
    giro_id: central ? 'requerido|entero' : 'entero',
    cliente_id: 'requerido|entero',
    nombre: 'requerido|texto|max:150',
    tipo: `requerido|en:${Operaciones.TIPOS_PROYECTO}`,
    ubicacion: 'requerido|texto|max:200'
  })
  const giroId = central ? datos.giro_id : usuario.giro_id
  if (!central && datos.giro_id && datos.giro_id !== giroId) throw prohibido('Solo puede registrar proyectos de su giro de negocio')
  if (!(await Catalogo.buscarGiro(giroId))) throw invalido({ giro_id: 'El giro de negocio no existe' })
  const cliente = await Clientes.basico(datos.cliente_id)
  if (!cliente?.activo) throw invalido({ cliente_id: 'El cliente no existe o está inactivo' })
  await revisar(datos, giroId)

  return transaccion(async () => {
    const proyectoId = await Operaciones.crearProyecto({ ...datos, giro_id: giroId, responsable_id: datos.responsable_id ?? usuario.id })
    if (datos.estado && datos.estado !== 'cotizacion') await Operaciones.actualizarProyecto(proyectoId, { estado: datos.estado })
    const proyecto = await Operaciones.buscarProyecto(proyectoId)
    await AlertaService.aCliente(cliente.id, {
      tipo: 'proyecto_nuevo',
      titulo: `Proyecto ${proyecto.codigo} registrado`,
      mensaje: `${proyecto.nombre} (${proyecto.ubicacion}) por ${quetzales(proyecto.monto_contrato)}. Podrá ver los avances en el portal.`,
      entidad: 'proyecto',
      entidad_id: proyectoId
    })
    return conPlazo(proyecto)
  })
}

export async function actualizar(usuario, proyectoId, entrada) {
  const proyecto = await obtener(usuario, proyectoId)
  const datos = validar(entrada, REGLAS)
  if (!Object.keys(datos).length) throw invalido({}, 'Envíe al menos un campo para actualizar')
  const nuevo = datos.estado
  if (nuevo && nuevo !== proyecto.estado && !FLUJO[proyecto.estado].includes(nuevo)) {
    const opciones = FLUJO[proyecto.estado].join(', ') || 'ninguno (estado final)'
    throw conflicto(`No se puede pasar de '${proyecto.estado}' a '${nuevo}'. Estados permitidos: ${opciones}`)
  }
  await revisar(datos, proyecto.giro_id, proyecto)
  if (nuevo === 'en_ejecucion' && !(datos.fecha_inicio ?? proyecto.fecha_inicio)) datos.fecha_inicio = hoy()

  await transaccion(async () => {
    await Operaciones.actualizarProyecto(proyecto.id, datos)
    if (nuevo === 'finalizado') {
      await Operaciones.actualizarProyecto(proyecto.id, { avance_porcentaje: 100 })
      if (proyecto.avance_porcentaje < 100) {
        await Operaciones.agregarAvance({ proyecto_id: proyecto.id, fecha: hoy(), porcentaje: 100, descripcion: 'Proyecto finalizado y entregado', registrado_por: usuario.id })
      }
    }
    if (nuevo && nuevo !== proyecto.estado) {
      await AlertaService.aCliente(proyecto.cliente_id, {
        tipo: 'proyecto_estado',
        titulo: `Proyecto ${proyecto.codigo}: ${etiqueta(nuevo)}`,
        mensaje: `${proyecto.nombre} pasó de ${etiqueta(proyecto.estado)} a ${etiqueta(nuevo)}.`,
        prioridad: ['suspendido', 'cancelado'].includes(nuevo) ? 'alta' : 'media',
        entidad: 'proyecto',
        entidad_id: proyecto.id
      })
    }
  })
  return conPlazo(await Operaciones.buscarProyecto(proyecto.id))
}

// El avance es acumulado: 35 significa que la obra va al 35 %
export async function agregarAvance(usuario, proyectoId, entrada) {
  const datos = validar(entrada, {
    porcentaje: 'requerido|numero|no_negativo|hasta:100',
    descripcion: 'requerido|texto|max:500',
    fecha: 'fecha'
  })
  const proyecto = await obtener(usuario, proyectoId)
  if (esCliente(usuario)) throw prohibido('Solo el personal registra avances')
  if (proyecto.estado !== 'en_ejecucion') throw conflicto(`El proyecto está ${etiqueta(proyecto.estado)}: solo se registran avances en ejecución`)
  if (datos.porcentaje < proyecto.avance_porcentaje) {
    throw invalido({ porcentaje: `El avance es acumulado y no puede bajar del ${proyecto.avance_porcentaje} % actual` })
  }
  const fecha = datos.fecha ?? hoy()
  if (fecha > hoy()) throw invalido({ fecha: 'No puede ser una fecha futura' })

  await transaccion(async () => {
    await Operaciones.agregarAvance({ proyecto_id: proyecto.id, fecha, porcentaje: datos.porcentaje, descripcion: datos.descripcion, registrado_por: usuario.id })
    await Operaciones.actualizarProyecto(proyecto.id, { avance_porcentaje: datos.porcentaje })
    const alerta = {
      tipo: 'proyecto_avance',
      titulo: `Avance de ${proyecto.codigo}: ${datos.porcentaje} %`,
      mensaje: `${proyecto.nombre}: ${datos.descripcion}`,
      entidad: 'proyecto',
      entidad_id: proyecto.id
    }
    await AlertaService.aCliente(proyecto.cliente_id, alerta)
    if (datos.porcentaje === 100) {
      await AlertaService.aGiro(proyecto.giro_id, ['gerente'], { ...alerta, titulo: `${proyecto.codigo} llegó al 100 %: márquelo como finalizado` }, usuario.id)
    }
  })
  return conPlazo(await Operaciones.buscarProyecto(proyecto.id))
}
