import { Suspense } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { Cargando } from '../../componentes/comunes.jsx'
import { BotonInstalar, EstadoConexion } from '../../componentes/Pwa.jsx'
import { useCarrito } from '../../contexto/carrito.jsx'
import { useSesion } from '../../contexto/sesion.jsx'

// Encabezado y pie del sitio público (sala de ventas)
export function LayoutSitio() {
  const { usuario } = useSesion()
  const { items } = useCarrito()
  return (
    <>
      <EstadoConexion />
      <header className="barra">
        <Link className="marca" to="/"><img src="/img/icon-192.png" alt="" />TransPort</Link>
        <nav className="menu-sitio">
          <NavLink to="/catalogo">Catálogo</NavLink>
          <NavLink to="/maquinaria">Maquinaria</NavLink>
          <NavLink to="/carrito" className="enlace-carrito">
            Carrito{items.length > 0 && <span className="contador">{items.length}</span>}
          </NavLink>
          <BotonInstalar />
          {usuario
            ? <Link className="boton boton-claro" to="/portal">Mi portal</Link>
            : <Link className="boton boton-claro" to="/ingresar">Iniciar sesión</Link>}
        </nav>
      </header>
      <Suspense fallback={<Cargando />}>
        <Outlet />
      </Suspense>
      <footer className="pie-sitio">
        <div>
          <strong>TransPort</strong> · Oficinas centrales: Edificio Sixtino, zona 10, Guatemala · PBX 2300-1000
        </div>
        <div>Extracción minera · Pisos y materiales · Maquinaria · Transporte · Construcción</div>
      </footer>
    </>
  )
}
