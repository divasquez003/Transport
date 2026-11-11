import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { Cargando } from './componentes/comunes.jsx'
import { useSesion } from './contexto/sesion.jsx'
import { LayoutPortal } from './paginas/portal/LayoutPortal.jsx'
import { LayoutSitio } from './paginas/sitio/LayoutSitio.jsx'
import { Inicio } from './paginas/sitio/Inicio.jsx'

// Sitio público (sala de ventas)
const Catalogo = lazy(() => import('./paginas/sitio/Catalogo.jsx'))
const Giro = lazy(() => import('./paginas/sitio/Giro.jsx'))
const Maquinaria = lazy(() => import('./paginas/sitio/Maquinaria.jsx'))
const Carrito = lazy(() => import('./paginas/sitio/Carrito.jsx'))
const Ingresar = lazy(() => import('./paginas/sitio/Ingresar.jsx'))
const Restablecer = lazy(() => import('./paginas/sitio/Restablecer.jsx'))

// Portal de clientes y empleados
const Panel = lazy(() => import('./paginas/portal/Panel.jsx'))
const Alertas = lazy(() => import('./paginas/portal/Alertas.jsx'))
const Pedidos = lazy(() => import('./paginas/portal/Pedidos.jsx'))
const Pedido = lazy(() => import('./paginas/portal/Pedido.jsx'))
const PedidosInternos = lazy(() => import('./paginas/portal/PedidosInternos.jsx'))
const Reuniones = lazy(() => import('./paginas/portal/Reuniones.jsx'))
const Mensajes = lazy(() => import('./paginas/portal/Mensajes.jsx'))
const Clientes = lazy(() => import('./paginas/portal/Clientes.jsx'))
const Inventario = lazy(() => import('./paginas/portal/Inventario.jsx'))
const Productos = lazy(() => import('./paginas/portal/Productos.jsx'))
const Produccion = lazy(() => import('./paginas/portal/Produccion.jsx'))
const Alquileres = lazy(() => import('./paginas/portal/Alquileres.jsx'))
const Viajes = lazy(() => import('./paginas/portal/Viajes.jsx'))
const Viaje = lazy(() => import('./paginas/portal/Viaje.jsx'))
const Gps = lazy(() => import('./paginas/portal/Gps.jsx'))
const Proyectos = lazy(() => import('./paginas/portal/Proyectos.jsx'))
const Proyecto = lazy(() => import('./paginas/portal/Proyecto.jsx'))
const Presupuesto = lazy(() => import('./paginas/portal/Presupuesto.jsx'))
const Reportes = lazy(() => import('./paginas/portal/Reportes.jsx'))
const Usuarios = lazy(() => import('./paginas/portal/Usuarios.jsx'))
const Integraciones = lazy(() => import('./paginas/portal/Integraciones.jsx'))
const Perfil = lazy(() => import('./paginas/portal/Perfil.jsx'))

// El portal exige sesión; si no hay, envía al inicio de sesión y luego regresa
function ConSesion({ children }) {
  const { usuario } = useSesion()
  const ubicacion = useLocation()
  if (!usuario) return <Navigate to={`/ingresar?volver=${encodeURIComponent(ubicacion.pathname + ubicacion.search)}`} replace />
  return children
}

function NoEncontrada() {
  return (
    <div className="contenedor pagina-simple">
      <h1>Página no encontrada</h1>
      <p>La dirección no existe. <a href="/">Volver al inicio</a></p>
    </div>
  )
}

export function App() {
  return (
    <Suspense fallback={<Cargando />}>
      <Routes>
        <Route element={<LayoutSitio />}>
          <Route index element={<Inicio />} />
          <Route path="catalogo" element={<Catalogo />} />
          <Route path="giros/:id" element={<Giro />} />
          <Route path="maquinaria" element={<Maquinaria />} />
          <Route path="carrito" element={<Carrito />} />
          <Route path="ingresar" element={<Ingresar />} />
          <Route path="restablecer" element={<Restablecer />} />
          <Route path="*" element={<NoEncontrada />} />
        </Route>
        <Route path="portal" element={<ConSesion><LayoutPortal /></ConSesion>}>
          <Route index element={<Panel />} />
          <Route path="alertas" element={<Alertas />} />
          <Route path="pedidos" element={<Pedidos />} />
          <Route path="pedidos/:id" element={<Pedido />} />
          <Route path="pedidos-internos" element={<PedidosInternos />} />
          <Route path="reuniones" element={<Reuniones />} />
          <Route path="mensajes" element={<Mensajes />} />
          <Route path="mensajes/:id" element={<Mensajes />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/:id" element={<Clientes />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="productos" element={<Productos />} />
          <Route path="produccion" element={<Produccion />} />
          <Route path="alquileres" element={<Alquileres />} />
          <Route path="viajes" element={<Viajes />} />
          <Route path="viajes/:id" element={<Viaje />} />
          <Route path="gps" element={<Gps />} />
          <Route path="proyectos" element={<Proyectos />} />
          <Route path="proyectos/:id" element={<Proyecto />} />
          <Route path="presupuesto" element={<Presupuesto />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="integraciones" element={<Integraciones />} />
          <Route path="perfil" element={<Perfil />} />
          <Route path="*" element={<NoEncontrada />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
