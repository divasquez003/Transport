import { transaccion } from '../db.js'
import { conflicto, invalido, noEncontrado, prohibido } from '../lib/http.js'
import { ahora } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { esCentral, esCliente, puedeVerGiro } from '../middlewares/acceso.js'
import * as Catalogo from '../models/catalogo.js'
import * as Clientes from '../models/clientes.js'
import * as Comunicacion from '../models/comunicacion.js'
import * as Usuarios from '../models/usuarios.js'
import * as AlertaService from './alertas.js'

const LUGAR_CENTRAL = 'Oficinas centrales, Edificio Sixtino, zona 10'

// Estados a los que se puede pasar con PATCH /reuniones/{id}/estado (confirmada se logra al asignar vendedor)
const FLUJO = {
  solicitada: ['cancelada'],
  confirmada: ['realizada', 'cancelada'],
  realizada: [],
  cancelada: []
}

const cuando = (fechaHora) => fechaHora.slice(0, 16)
const dondeEs = (r) => (r.modalidad === 'presencial' ? r.lugar ?? LUGAR_CENTRAL : `videoconferencia${r.enlace ? `: ${r.enlace}` : ''}`)

// Los productos "por cotización" (edificios, contratos de transporte) se cierran en una reunión con un vendedor
export async function crear(usuario, entrada) {
  const cliente = esCliente(usuario)
  const datos = validar(entrada, {
    cliente_id: cliente ? 'entero' : 'requerido|entero',
    giro_id: 'entero',
    producto_id: 'entero',
    asunto: 'requerido|texto|max:150',
    fecha_hora: 'requerido|fechahora',
    modalidad: `en:${Comunicacion.MODALIDADES}`,
    notas: 'texto|max:500'
  })
  const clienteId = cliente ? usuario.cliente_id : datos.cliente_id
  const registro = await Clientes.basico(clienteId)
  if (!registro?.activo) throw invalido({ cliente_id: 'El cliente no existe o está inactivo' })

  let giroId = datos.giro_id ?? null
  let productoId = null
  if (datos.producto_id) {
    const producto = await Catalogo.buscarProducto(datos.producto_id)
    if (!producto) throw invalido({ producto_id: 'El producto no existe' })
    if (giroId && giroId !== producto.giro_id) throw invalido({ producto_id: 'El producto no pertenece al giro indicado' })
    giroId = producto.giro_id
    productoId = producto.id
  }
  if (!giroId || !(await Catalogo.buscarGiro(giroId))) throw invalido({ giro_id: 'Indique el giro de negocio o el producto de interés' })
  if (!cliente && !puedeVerGiro(usuario, giroId)) throw prohibido('Solo puede agendar reuniones de su giro de negocio')
  if (datos.fecha_hora <= ahora()) throw invalido({ fecha_hora: 'Debe ser una fecha y hora futura' })

  const modalidad = datos.modalidad ?? 'presencial'
  const lugar = modalidad === 'presencial' ? LUGAR_CENTRAL : null

  return transaccion(async () => {
    const reunionId = await Comunicacion.crearReunion({
      cliente_id: clienteId,
      giro_id: giroId,
      producto_id: productoId,
      solicitado_por: usuario.id,
      asunto: datos.asunto,
      fecha_hora: datos.fecha_hora,
      modalidad,
      lugar,
      notas: datos.notas
    })
    // Si la agenda un vendedor, queda confirmada con él; si no, el gerente asigna a alguien
    if (usuario.rol === 'vendedor') {
      await Comunicacion.asignarReunion(reunionId, usuario.id, datos.fecha_hora, lugar, null)
      const reunion = await Comunicacion.buscarReunion(reunionId)
      await AlertaService.aCliente(clienteId, {
        tipo: 'reunion_confirmada',
        titulo: 'Reunión confirmada',
        mensaje: `${usuario.nombre} agendó "${reunion.asunto}" para el ${cuando(reunion.fecha_hora)} (${dondeEs(reunion)}).`,
        entidad: 'reunion',
        entidad_id: reunionId
      })
      return reunion
    }
    const reunion = await Comunicacion.buscarReunion(reunionId)
    await AlertaService.aGiro(giroId, ['gerente'], {
      tipo: 'reunion_solicitada',
      titulo: 'Nueva solicitud de reunión',
      mensaje: `${reunion.cliente}: ${reunion.asunto} (${cuando(reunion.fecha_hora)}, ${modalidad}). Asigne un vendedor.`,
      entidad: 'reunion',
      entidad_id: reunionId
    }, usuario.id)
    return reunion
  })
}

export function alcance(usuario) {
  if (esCliente(usuario)) return { cliente_id: usuario.cliente_id }
  return esCentral(usuario) ? {} : { giro_id: usuario.giro_id }
}

export async function obtener(usuario, reunionId) {
  const reunion = await Comunicacion.buscarReunion(reunionId)
  if (!reunion || (esCliente(usuario) && reunion.cliente_id !== usuario.cliente_id)) throw noEncontrado('Reunión', 'a')
  if (!esCliente(usuario) && !puedeVerGiro(usuario, reunion.giro_id)) throw prohibido('La reunión pertenece a otro giro de negocio')
  return reunion
}

// El gerente asigna un vendedor de su giro; puede ajustar fecha, lugar o enlace de videoconferencia
export async function asignar(usuario, reunionId, entrada) {
  const datos = validar(entrada, {
    vendedor_id: 'requerido|entero',
    fecha_hora: 'fechahora',
    lugar: 'texto|max:200',
    enlace: 'url|max:255'
  })
  const reunion = await obtener(usuario, reunionId)
  if (!['solicitada', 'confirmada'].includes(reunion.estado)) throw conflicto(`La reunión ya está ${reunion.estado}`)
  const vendedor = await Usuarios.buscarPersonal(datos.vendedor_id)
  if (!vendedor?.activo || vendedor.rol !== 'vendedor' || vendedor.giro_id !== reunion.giro_id) {
    throw invalido({ vendedor_id: `Debe ser un vendedor activo de ${reunion.giro}` })
  }
  if (datos.fecha_hora && datos.fecha_hora <= ahora()) throw invalido({ fecha_hora: 'Debe ser una fecha y hora futura' })
  const fechaHora = datos.fecha_hora ?? reunion.fecha_hora
  const lugar = datos.lugar ?? reunion.lugar
  const enlace = datos.enlace ?? reunion.enlace

  await transaccion(async () => {
    await Comunicacion.asignarReunion(reunion.id, vendedor.id, fechaHora, lugar, enlace)
    const lugarTexto = dondeEs({ ...reunion, lugar, enlace })
    await AlertaService.enviar([vendedor.id], {
      tipo: 'reunion_asignada',
      titulo: 'Reunión asignada',
      mensaje: `${reunion.cliente}: ${reunion.asunto} (${cuando(fechaHora)}, ${lugarTexto}).`,
      entidad: 'reunion',
      entidad_id: reunion.id
    }, usuario.id)
    await AlertaService.aCliente(reunion.cliente_id, {
      tipo: 'reunion_confirmada',
      titulo: 'Reunión confirmada',
      mensaje: `Lo atenderá ${vendedor.nombre} (${vendedor.correo}) el ${cuando(fechaHora)} en ${lugarTexto}.`,
      entidad: 'reunion',
      entidad_id: reunion.id
    })
  })
  return Comunicacion.buscarReunion(reunion.id)
}

// realizada: la marca el vendedor asignado o la gestión del giro. cancelada: también el cliente
export async function cambiarEstado(usuario, reunionId, entrada) {
  const datos = validar(entrada, { estado: 'requerido|en:realizada,cancelada', notas: 'texto|max:500' })
  const reunion = await obtener(usuario, reunionId)
  const nuevo = datos.estado
  if (!FLUJO[reunion.estado].includes(nuevo)) {
    const opciones = FLUJO[reunion.estado].join(', ') || 'ninguno (estado final)'
    throw conflicto(`No se puede pasar de '${reunion.estado}' a '${nuevo}'. Estados permitidos: ${opciones}`)
  }
  const cliente = esCliente(usuario)
  if (cliente && nuevo !== 'cancelada') throw prohibido('El cliente solo puede cancelar la reunión')
  if (usuario.rol === 'vendedor' && reunion.vendedor_id !== usuario.id) throw prohibido('Solo el vendedor asignado puede actualizar esta reunión')
  if (usuario.rol === 'operativo') throw prohibido('Su rol no puede actualizar reuniones')
  if (nuevo === 'cancelada' && !datos.notas) throw invalido({ notas: 'Indique el motivo de la cancelación' })

  await transaccion(async () => {
    await Comunicacion.cambiarEstadoReunion(reunion.id, nuevo, datos.notas)
    if (nuevo !== 'cancelada') return
    const alerta = {
      tipo: 'reunion_cancelada',
      titulo: `Reunión cancelada: ${reunion.asunto}`.slice(0, 150),
      mensaje: `${usuario.nombre} canceló la reunión del ${cuando(reunion.fecha_hora)}. Motivo: ${datos.notas}`,
      prioridad: 'alta',
      entidad: 'reunion',
      entidad_id: reunion.id
    }
    if (cliente) {
      const personal = await Usuarios.idsPorGiro(reunion.giro_id, ['gerente'])
      if (reunion.vendedor_id) personal.push(reunion.vendedor_id)
      await AlertaService.enviar(personal, alerta, usuario.id)
    } else {
      await AlertaService.aCliente(reunion.cliente_id, alerta)
    }
  })
  return Comunicacion.buscarReunion(reunion.id)
}
