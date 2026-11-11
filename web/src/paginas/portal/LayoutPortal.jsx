import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Cargando } from '../../componentes/comunes.jsx'
import { BotonInstalar, EstadoConexion } from '../../componentes/Pwa.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { ROLES } from '../../lib/formato.js'
import { delGiro, esCliente, GESTION, PERSONAL, tiene } from '../../lib/permisos.js'

// Opciones del menú según el rol y el giro de negocio del usuario
const MENU = [
  { ruta: '/portal', texto: 'Inicio', fin: true },
  { ruta: '/portal/alertas', texto: 'Alertas', contador: true },
  { ruta: '/portal/pedidos', texto: (u) => (esCliente(u) ? 'Mis pedidos' : 'Pedidos') },
  { ruta: '/portal/pedidos-internos', texto: 'Pedidos entre giros', ver: (u) => tiene(u, PERSONAL) },
  { ruta: '/portal/reuniones', texto: 'Reuniones' },
  { ruta: '/portal/mensajes', texto: 'Mensajes' },
  { ruta: '/portal/clientes', texto: 'Clientes', ver: (u) => tiene(u, PERSONAL) },
  { ruta: '/portal/inventario', texto: 'Inventario', ver: (u) => tiene(u, PERSONAL) },
  { ruta: '/portal/productos', texto: 'Productos', ver: (u) => tiene(u, GESTION) },
  { ruta: '/portal/produccion', texto: 'Producción', ver: (u) => tiene(u, PERSONAL) && delGiro(u, 'MINERIA', 'PROCESO') },
  { ruta: '/portal/alquileres', texto: (u) => (esCliente(u) ? 'Mis alquileres' : 'Maquinaria y alquileres'), ver: (u) => esCliente(u) || (tiene(u, PERSONAL) && delGiro(u, 'MAQUINARIA')) },
  { ruta: '/portal/viajes', texto: (u) => (esCliente(u) ? 'Seguimiento de viajes' : 'Viajes') },
  { ruta: '/portal/gps', texto: 'Flota y GPS', ver: (u) => tiene(u, PERSONAL) && delGiro(u, 'MAQUINARIA', 'TRANSP_MP', 'TRANSP_PROD') },
  { ruta: '/portal/proyectos', texto: (u) => (esCliente(u) ? 'Mis proyectos' : 'Proyectos'), ver: (u) => esCliente(u) || (tiene(u, PERSONAL) && delGiro(u, 'CONSTRUCCION')) },
  { ruta: '/portal/presupuesto', texto: 'Presupuesto y gastos', ver: (u) => tiene(u, GESTION) },
  { ruta: '/portal/reportes', texto: (u) => (esCliente(u) ? 'Estado de cuenta' : 'Reportes'), ver: (u) => esCliente(u) || tiene(u, GESTION) },
  { ruta: '/portal/usuarios', texto: 'Usuarios', ver: (u) => tiene(u, ['dueno', 'admin_general', 'gerente']) },
  { ruta: '/portal/integraciones', texto: 'Integraciones', ver: (u) => tiene(u, GESTION) },
  { ruta: '/portal/perfil', texto: 'Mi perfil' }
]

export function LayoutPortal() {
  const { usuario, noLeidas, salir, refrescar } = useSesion()
  const ubicacion = useLocation()
  const navegar = useNavigate()
  const [menuAbierto, setMenuAbierto] = useState(false)

  // Al cambiar de página se cierra el menú (celular) y se actualiza el contador de alertas
  useEffect(() => {
    setMenuAbierto(false)
    refrescar()
  }, [ubicacion.pathname, refrescar])

  const cerrarSesion = () => {
    salir()
    navegar('/ingresar', { replace: true })
  }

  const opciones = MENU.filter((o) => !o.ver || o.ver(usuario))
  const subtitulo = esCliente(usuario) ? usuario.cliente : usuario.giro ?? 'Sede central'

  return (
    <div className={`portal${menuAbierto ? ' menu-abierto' : ''}`}>
      <EstadoConexion />
      <header className="barra barra-portal">
        <button type="button" className="boton-menu" aria-label="Menú" aria-expanded={menuAbierto} onClick={() => setMenuAbierto((v) => !v)}>☰</button>
        <Link className="marca" to="/portal"><img src="/img/icon-192.png" alt="" />TransPort</Link>
        <div className="usuario-barra">
          <BotonInstalar />
          <Link to="/portal/alertas" className="campana" aria-label={`${noLeidas} alertas sin leer`}>
            🔔{noLeidas > 0 && <span className="contador">{noLeidas}</span>}
          </Link>
          <span className="quien">
            <strong>{usuario.nombre}</strong>
            <small>{ROLES[usuario.rol]} · {subtitulo}</small>
          </span>
          <button type="button" className="boton boton-claro boton-chico" onClick={cerrarSesion}>Salir</button>
        </div>
      </header>
      <aside className="menu-portal">
        <nav>
          {opciones.map((o) => (
            <NavLink key={o.ruta} to={o.ruta} end={o.fin}>
              {typeof o.texto === 'function' ? o.texto(usuario) : o.texto}
              {o.contador && noLeidas > 0 && <span className="contador">{noLeidas}</span>}
            </NavLink>
          ))}
          <hr />
          <Link to="/catalogo">Catálogo y pedidos en línea</Link>
          <Link to="/">Sitio web</Link>
        </nav>
      </aside>
      <main className="contenido-portal">
        <Suspense fallback={<Cargando />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
