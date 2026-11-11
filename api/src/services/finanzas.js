import { transaccion } from '../db.js'
import { invalido, prohibido } from '../lib/http.js'
import { hoy, quetzales, redondear } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { esCentral, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Operaciones from '../models/operaciones.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from './alertas.js'

// Umbrales de consumo del presupuesto que generan alerta
const UMBRALES = [
  { porcentaje: 100, tipo: 'presupuesto_excedido', prioridad: 'alta', texto: 'superó el presupuesto' },
  { porcentaje: 80, tipo: 'presupuesto_80', prioridad: 'media', texto: 'alcanzó el 80 % del presupuesto' }
]

// "Mano de obra" => mano_de_obra
export const categoria = (texto) => String(texto).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Avisa al gerente del giro y a la sede central cuando un gasto cruza el 80 % o el 100 % del presupuesto del mes
async function revisarPresupuesto(giroId, fecha, monto, categoriaGasto) {
  const [anio, mes] = [Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7))]
  for (const cat of [...new Set([categoriaGasto, 'general'])]) {
    const presupuesto = await Operaciones.buscarPresupuesto(giroId, anio, mes, cat)
    if (!presupuesto || presupuesto.monto <= 0) continue
    const despues = (presupuesto.gastado / presupuesto.monto) * 100
    const antes = ((presupuesto.gastado - monto) / presupuesto.monto) * 100
    const cruzado = UMBRALES.find((u) => antes < u.porcentaje && despues >= u.porcentaje)
    if (!cruzado) continue
    const destinatarios = [...await Usuarios.idsPorGiro(giroId, ['gerente', 'administrativo']), ...await Usuarios.idsPorRol(['dueno', 'admin_general'])]
    await AlertaService.enviar(destinatarios, {
      tipo: cruzado.tipo,
      titulo: `Presupuesto ${cat === 'general' ? '' : `de ${cat} `}de ${presupuesto.giro}: ${redondear(despues)} %`,
      mensaje: `El gasto de ${String(mes).padStart(2, '0')}/${anio} ${cruzado.texto}: ${quetzales(presupuesto.gastado)} de ${quetzales(presupuesto.monto)}.`,
      prioridad: cruzado.prioridad,
      entidad: 'presupuesto',
      entidad_id: presupuesto.id
    })
  }
}

export async function crearGasto(usuario, entrada) {
  const central = esCentral(usuario)
  const datos = validar(entrada, {
    giro_id: central ? 'requerido|entero' : 'entero',
    sede_id: 'entero',
    categoria: 'requerido|texto|max:60',
    descripcion: 'requerido|texto|max:255',
    monto: 'requerido|numero|positivo|hasta:999999999',
    fecha: 'fecha',
    documento: 'texto|max:50'
  })
  const giroId = central ? datos.giro_id : usuario.giro_id
  if (!puedeVerGiro(usuario, giroId) || (datos.giro_id && datos.giro_id !== giroId)) throw prohibido('Solo puede registrar gastos de su giro de negocio')
  if (!(await Catalogo.buscarGiro(giroId))) throw invalido({ giro_id: 'El giro de negocio no existe' })
  if (datos.sede_id) {
    const sede = await Catalogo.buscarSede(datos.sede_id)
    if (sede?.giro_id !== giroId) throw invalido({ sede_id: 'La sede no pertenece al giro' })
  }
  const fecha = datos.fecha ?? hoy()
  if (fecha > hoy()) throw invalido({ fecha: 'No puede ser una fecha futura' })
  const cat = categoria(datos.categoria)
  if (!cat) throw invalido({ categoria: 'Categoría no válida' })

  return transaccion(async () => {
    const gastoId = await Operaciones.crearGasto({ ...datos, giro_id: giroId, categoria: cat, fecha, registrado_por: usuario.id })
    await revisarPresupuesto(giroId, fecha, datos.monto, cat)
    const presupuesto = await Operaciones.buscarPresupuesto(giroId, Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)), 'general')
    return {
      id: gastoId,
      giro_id: giroId,
      categoria: cat,
      descripcion: datos.descripcion,
      monto: datos.monto,
      fecha,
      documento: datos.documento ?? null,
      presupuesto_mes: presupuesto && {
        monto: presupuesto.monto,
        gastado: presupuesto.gastado,
        porcentaje: redondear((presupuesto.gastado / presupuesto.monto) * 100)
      }
    }
  })
}
