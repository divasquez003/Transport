import { despues } from '../db.js'
import * as Alertas from '../models/alertas.js'
import * as Usuarios from '../models/usuarios.js'
import { CENTRAL } from '../middlewares/acceso.js'
import { enviarPush } from './push.js'

// Página del portal que abre la notificación según el tipo de registro
const RUTAS = {
  pedido: (id) => `/portal/pedidos/${id}`,
  pedido_interno: () => '/portal/pedidos-internos',
  reunion: () => '/portal/reuniones',
  conversacion: (id) => `/portal/mensajes/${id}`,
  alquiler: () => '/portal/alquileres',
  viaje: (id) => `/portal/viajes/${id}`,
  vehiculo: () => '/portal/gps',
  maquina: () => '/portal/gps',
  proyecto: (id) => `/portal/proyectos/${id}`,
  producto: () => '/portal/inventario',
  orden_produccion: () => '/portal/produccion',
  presupuesto: () => '/portal/presupuesto'
}

// Guarda la alerta para cada usuario y, al confirmar la transacción, envía la notificación push
export async function enviar(usuarioIds, alerta, excluir = null) {
  const ids = [...new Set(usuarioIds.map(Number))].filter((id) => id > 0 && id !== Number(excluir))
  if (!ids.length) return 0
  const registro = {
    tipo: alerta.tipo,
    titulo: String(alerta.titulo).slice(0, 150),
    mensaje: String(alerta.mensaje).slice(0, 500),
    prioridad: alerta.prioridad ?? 'media',
    entidad: alerta.entidad ?? null,
    entidad_id: alerta.entidad_id ?? null
  }
  await Alertas.crear(ids, registro)
  const url = RUTAS[registro.entidad]?.(registro.entidad_id) ?? '/portal/alertas'
  despues(() => enviarPush(ids, { titulo: registro.titulo, mensaje: registro.mensaje, url }))
  return ids.length
}

export async function aGiro(giroId, roles, alerta, excluir = null) {
  return enviar(await Usuarios.idsPorGiro(giroId, roles), alerta, excluir)
}

export async function aCliente(clienteId, alerta, excluir = null) {
  if (!clienteId) return 0
  return enviar(await Usuarios.idsDeCliente(clienteId), alerta, excluir)
}

export async function aCentral(alerta, excluir = null) {
  return enviar(await Usuarios.idsPorRol(CENTRAL), alerta, excluir)
}
