import { Router } from 'express'
import * as Alertas from './controllers/alertas.js'
import * as Auth from './controllers/auth.js'
import * as Catalogo from './controllers/catalogo.js'
import * as Clientes from './controllers/clientes.js'
import * as Externo from './controllers/externo.js'
import * as Finanzas from './controllers/finanzas.js'
import * as Gps from './controllers/gps.js'
import * as Integraciones from './controllers/integraciones.js'
import * as Inventario from './controllers/inventario.js'
import * as Maquinaria from './controllers/maquinaria.js'
import * as Mensajes from './controllers/mensajes.js'
import * as Pedidos from './controllers/pedidos.js'
import * as PedidosInternos from './controllers/pedidosInternos.js'
import * as Produccion from './controllers/produccion.js'
import * as Proyectos from './controllers/proyectos.js'
import * as Reportes from './controllers/reportes.js'
import * as Reuniones from './controllers/reuniones.js'
import * as Salud from './controllers/salud.js'
import * as Transporte from './controllers/transporte.js'
import * as Usuarios from './controllers/usuarios.js'
import { HttpError } from './lib/http.js'
import {
  AUTENTICADO, CENTRAL, CLIENTES_Y_VENTAS, GESTION, OPCIONAL, PERSONAL, PUBLICO, VENTAS,
  acceso, apiKey, tokenGps
} from './middlewares/acceso.js'

export const router = Router()

// Catálogo de endpoints: lo usan /api/salud, la respuesta 405 y la documentación
export const catalogo = []

const GRUPOS = new Map([
  [PUBLICO, 'Público'], [OPCIONAL, 'Público (con sesión muestra más datos)'], [AUTENTICADO, 'Con sesión'],
  [CENTRAL, 'Sede central'], [GESTION, 'Gestión'], [PERSONAL, 'Personal'], [VENTAS, 'Ventas'], [CLIENTES_Y_VENTAS, 'Clientes y ventas']
])

function ruta(metodo, camino, regla, manejador) {
  const proteccion = typeof regla === 'function' ? regla : acceso(regla)
  const completa = `/api${camino}`
  catalogo.push({
    metodo: metodo.toUpperCase(),
    ruta: completa.replaceAll(/:(\w+)/g, '{$1}'),
    acceso: typeof regla === 'function' ? regla.descripcion : (GRUPOS.get(regla) ?? regla.join(', ')),
    patron: new RegExp(`^${completa.replaceAll(/:(\w+)/g, '\\d+')}/?$`)
  })
  router[metodo](camino, proteccion, manejador)
}

router.param('id', (req, res, next, valor) => {
  next(/^\d+$/.test(valor) ? undefined : new HttpError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`))
})

ruta('get', '/salud', PUBLICO, Salud.estado)

// Autenticación
ruta('post', '/auth/login', PUBLICO, Auth.login)
ruta('post', '/auth/registro', PUBLICO, Auth.registro)
ruta('get', '/auth/perfil', AUTENTICADO, Auth.perfil)
ruta('put', '/auth/password', AUTENTICADO, Auth.cambiarPassword)
ruta('post', '/auth/recuperar', PUBLICO, Auth.recuperar)
ruta('post', '/auth/restablecer', PUBLICO, Auth.restablecer)

// Usuarios y roles
ruta('get', '/usuarios', ['dueno', 'admin_general', 'gerente'], Usuarios.listar)
ruta('post', '/usuarios', CENTRAL, Usuarios.crear)
ruta('put', '/usuarios/:id', CENTRAL, Usuarios.actualizar)
ruta('patch', '/usuarios/:id/estado', CENTRAL, Usuarios.cambiarEstado)
ruta('get', '/roles', CENTRAL, Usuarios.roles)

// Giros de negocio y sedes (sala de ventas)
ruta('get', '/giros', PUBLICO, Catalogo.listarGiros)
ruta('get', '/giros/:id', PUBLICO, Catalogo.verGiro)
ruta('put', '/giros/:id', CENTRAL, Catalogo.actualizarGiro)
ruta('get', '/sedes', PUBLICO, Catalogo.listarSedes)
ruta('get', '/sedes/:id', OPCIONAL, Catalogo.verSede)
ruta('post', '/sedes', CENTRAL, Catalogo.crearSede)
ruta('put', '/sedes/:id', CENTRAL, Catalogo.actualizarSede)

// Catálogo de productos y servicios
ruta('get', '/productos', OPCIONAL, Catalogo.listarProductos)
ruta('get', '/productos/:id', OPCIONAL, Catalogo.verProducto)
ruta('post', '/productos', GESTION, Catalogo.crearProducto)
ruta('put', '/productos/:id', GESTION, Catalogo.actualizarProducto)
ruta('delete', '/productos/:id', GESTION, Catalogo.eliminarProducto)

// Inventario por sede
ruta('get', '/inventario', PERSONAL, Inventario.existencias)
ruta('post', '/inventario/movimientos', PERSONAL, Inventario.crearMovimiento)
ruta('get', '/inventario/movimientos', PERSONAL, Inventario.movimientos)

// Clientes
ruta('get', '/clientes', PERSONAL, Clientes.listar)
ruta('get', '/clientes/:id', AUTENTICADO, Clientes.ver)
ruta('post', '/clientes', VENTAS, Clientes.crear)
ruta('put', '/clientes/:id', AUTENTICADO, Clientes.actualizar)

// Pedidos en línea de clientes
ruta('post', '/pedidos', CLIENTES_Y_VENTAS, Pedidos.crear)
ruta('get', '/pedidos', AUTENTICADO, Pedidos.listar)
ruta('get', '/pedidos/:id', AUTENTICADO, Pedidos.ver)
ruta('patch', '/pedidos/:id/estado', AUTENTICADO, Pedidos.cambiarEstado)
ruta('patch', '/pedidos/:id/vendedor', GESTION, Pedidos.asignarVendedor)

// Pedidos entre giros de negocio (abastecimiento)
ruta('post', '/pedidos-internos', GESTION, PedidosInternos.crear)
ruta('get', '/pedidos-internos', PERSONAL, PedidosInternos.listar)
ruta('get', '/pedidos-internos/:id', PERSONAL, PedidosInternos.ver)
ruta('patch', '/pedidos-internos/:id/estado', GESTION, PedidosInternos.cambiarEstado)

// Alertas, recordatorios y notificaciones push
ruta('get', '/alertas', AUTENTICADO, Alertas.listar)
ruta('patch', '/alertas/leidas', AUTENTICADO, Alertas.marcarTodas)
ruta('patch', '/alertas/:id/leida', AUTENTICADO, Alertas.marcarLeida)
ruta('get', '/recordatorios', AUTENTICADO, Alertas.listarRecordatorios)
ruta('post', '/recordatorios', AUTENTICADO, Alertas.crearRecordatorio)
ruta('delete', '/recordatorios/:id', AUTENTICADO, Alertas.eliminarRecordatorio)
ruta('get', '/notificaciones/clave-publica', PUBLICO, Alertas.clavePublica)
ruta('post', '/notificaciones/suscripcion', AUTENTICADO, Alertas.suscribir)

// Reuniones con vendedores para cerrar tratos
ruta('post', '/reuniones', CLIENTES_Y_VENTAS, Reuniones.crear)
ruta('get', '/reuniones', AUTENTICADO, Reuniones.listar)
ruta('get', '/reuniones/:id', AUTENTICADO, Reuniones.ver)
ruta('patch', '/reuniones/:id/asignar', GESTION, Reuniones.asignar)
ruta('patch', '/reuniones/:id/estado', AUTENTICADO, Reuniones.cambiarEstado)

// Mensajería cliente - empresa
ruta('get', '/conversaciones', AUTENTICADO, Mensajes.listar)
ruta('post', '/conversaciones', CLIENTES_Y_VENTAS, Mensajes.crear)
ruta('get', '/conversaciones/:id/mensajes', AUTENTICADO, Mensajes.mensajes)
ruta('post', '/conversaciones/:id/mensajes', AUTENTICADO, Mensajes.responder)

// Maquinaria: venta y alquiler
ruta('get', '/maquinas', OPCIONAL, Maquinaria.listar)
ruta('post', '/maquinas', GESTION, Maquinaria.crear)
ruta('get', '/maquinas/:id', OPCIONAL, Maquinaria.ver)
ruta('put', '/maquinas/:id', GESTION, Maquinaria.actualizar)
ruta('get', '/maquinas/:id/disponibilidad', PUBLICO, Maquinaria.disponibilidad)
ruta('post', '/alquileres', CLIENTES_Y_VENTAS, Maquinaria.crearAlquiler)
ruta('get', '/alquileres', AUTENTICADO, Maquinaria.listarAlquileres)
ruta('patch', '/alquileres/:id/estado', AUTENTICADO, Maquinaria.cambiarEstadoAlquiler)

// Transporte de materia prima y de productos
ruta('get', '/vehiculos', PERSONAL, Transporte.listarVehiculos)
ruta('post', '/vehiculos', GESTION, Transporte.crearVehiculo)
ruta('put', '/vehiculos/:id', GESTION, Transporte.actualizarVehiculo)
ruta('post', '/viajes', GESTION, Transporte.crearViaje)
ruta('get', '/viajes', AUTENTICADO, Transporte.listarViajes)
ruta('get', '/viajes/:id', AUTENTICADO, Transporte.verViaje)
ruta('patch', '/viajes/:id/estado', PERSONAL, Transporte.cambiarEstadoViaje)

// Producción: extracción minera y plantas de proceso
ruta('post', '/produccion/extraccion', PERSONAL, Produccion.registrarExtraccion)
ruta('get', '/produccion/extraccion', PERSONAL, Produccion.listarExtraccion)
ruta('post', '/produccion/ordenes', GESTION, Produccion.crearOrden)
ruta('get', '/produccion/ordenes', PERSONAL, Produccion.listarOrdenes)
ruta('patch', '/produccion/ordenes/:id', PERSONAL, Produccion.actualizarOrden)

// Construcción: proyectos y avances
ruta('get', '/proyectos', AUTENTICADO, Proyectos.listar)
ruta('post', '/proyectos', GESTION, Proyectos.crear)
ruta('get', '/proyectos/:id', AUTENTICADO, Proyectos.ver)
ruta('put', '/proyectos/:id', GESTION, Proyectos.actualizar)
ruta('post', '/proyectos/:id/avances', PERSONAL, Proyectos.agregarAvance)

// Presupuesto y gastos por giro
ruta('get', '/presupuestos', GESTION, Finanzas.listarPresupuestos)
ruta('post', '/presupuestos', CENTRAL, Finanzas.guardarPresupuesto)
ruta('get', '/gastos', GESTION, Finanzas.listarGastos)
ruta('post', '/gastos', GESTION, Finanzas.crearGasto)

// GPS (GPS-Inversiones): recepción de eventos y consulta
ruta('post', '/gps/eventos', tokenGps, Gps.recibirEventos)
ruta('get', '/gps/dispositivos', PERSONAL, Gps.listar)
ruta('get', '/gps/dispositivos/:id/posicion', PERSONAL, Gps.posicion)
ruta('get', '/gps/dispositivos/:id/recorrido', PERSONAL, Gps.recorrido)

// Reportes para la toma de decisiones
ruta('get', '/reportes/consolidado', CENTRAL, Reportes.consolidado)
ruta('get', '/reportes/giros/:id', GESTION, Reportes.giro)
ruta('get', '/reportes/ventas', GESTION, Reportes.ventas)
ruta('get', '/reportes/presupuesto', GESTION, Reportes.presupuesto)
ruta('get', '/reportes/clientes/:id', AUTENTICADO, Reportes.cliente)
ruta('get', '/reportes/exportar', GESTION, Reportes.exportar)

// Integración con sistemas de terceros (API REST, webhooks, CSV/EDI)
ruta('get', '/integraciones/api-claves', CENTRAL, Integraciones.listarClaves)
ruta('post', '/integraciones/api-claves', CENTRAL, Integraciones.crearClave)
ruta('get', '/integraciones/webhooks', CENTRAL, Integraciones.listarWebhooks)
ruta('post', '/integraciones/webhooks', CENTRAL, Integraciones.crearWebhook)
ruta('delete', '/integraciones/webhooks/:id', CENTRAL, Integraciones.eliminarWebhook)
ruta('post', '/integraciones/edi/importar', GESTION, Integraciones.importar)
ruta('get', '/integraciones/edi/exportar', GESTION, Integraciones.exportar)
ruta('get', '/integraciones/bitacora', CENTRAL, Integraciones.bitacora)

// API para sistemas de terceros (encabezado X-API-Key)
ruta('get', '/externo/pedidos', apiKey('pedidos:leer'), Externo.listarPedidos)
ruta('post', '/externo/pedidos', apiKey('pedidos:crear'), Externo.crearPedido)
ruta('get', '/externo/viajes/:id', apiKey('viajes:leer'), Externo.verViaje)

// 405 si la ruta existe con otro método; 404 si no existe
export function rutaNoEncontrada(req, res, next) {
  const permitidos = [...new Set(catalogo.filter((r) => r.patron.test(req.path)).map((r) => r.metodo))]
  if (permitidos.length) {
    const error = new HttpError(405, 'Método no permitido para esta ruta')
    error.permitidos = permitidos.join(', ')
    return next(error)
  }
  next(new HttpError(404, `Ruta no encontrada: ${req.method} ${req.path}`))
}
