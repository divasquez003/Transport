// Página del portal relacionada con cada alerta (entidad + id)
const RUTAS = {
  pedido: (id) => `/portal/pedidos/${id}`,
  pedido_interno: (id) => `/portal/pedidos-internos?id=${id}`,
  reunion: () => '/portal/reuniones',
  conversacion: (id) => `/portal/mensajes/${id}`,
  alquiler: () => '/portal/alquileres',
  viaje: (id) => `/portal/viajes/${id}`,
  vehiculo: () => '/portal/gps',
  maquina: () => '/portal/gps',
  proyecto: (id) => `/portal/proyectos/${id}`,
  producto: () => '/portal/inventario?bajo_minimo=1',
  orden_produccion: () => '/portal/produccion',
  presupuesto: () => '/portal/presupuesto',
  cliente: (id) => `/portal/clientes/${id}`
}

export const enlaceEntidad = (entidad, id) => RUTAS[entidad]?.(id) ?? null
