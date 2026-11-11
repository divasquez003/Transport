import { Link, useNavigate, useSearchParams } from 'react-router'
import { Contenido, Encabezado, Estado, Paginacion } from '../../componentes/comunes.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta } from '../../lib/api.js'
import { fecha, quetzales } from '../../lib/formato.js'
import { esCentral, esCliente, tiene, VENTAS } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

const ESTADOS = ['pendiente', 'confirmado', 'en_proceso', 'despachado', 'entregado', 'cancelado']

export default function Pedidos() {
  const { usuario } = useSesion()
  const navegar = useNavigate()
  const [parametros, setParametros] = useSearchParams()
  const filtros = Object.fromEntries(parametros)
  const pedidos = useDatos(`/pedidos${consulta(filtros)}`)
  const giros = useDatos(esCentral(usuario) ? '/giros' : null)
  const cliente = esCliente(usuario)

  const cambiar = (campo, valor) => {
    const nuevos = { ...filtros, [campo]: valor }
    if (campo !== 'pagina') delete nuevos.pagina
    setParametros(Object.fromEntries(Object.entries(nuevos).filter(([, v]) => v)))
  }

  return (
    <>
      <Encabezado titulo={cliente ? 'Mis pedidos' : 'Pedidos de clientes'} descripcion={cliente ? 'Siga el estado de cada pedido; le avisamos cada cambio.' : 'Pedidos en línea y registrados por vendedores.'}>
        {(cliente || tiene(usuario, VENTAS)) && <Link className="boton" to="/catalogo">Nuevo pedido</Link>}
      </Encabezado>
      <div className="filtros">
        <select value={filtros.estado ?? ''} onChange={(e) => cambiar('estado', e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
        </select>
        {giros.datos && (
          <select value={filtros.giro_id ?? ''} onChange={(e) => cambiar('giro_id', e.target.value)} aria-label="Giro">
            <option value="">Todos los giros</option>
            {giros.datos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        )}
        <label className="campo-linea">Desde <input type="date" value={filtros.desde ?? ''} onChange={(e) => cambiar('desde', e.target.value)} /></label>
        <label className="campo-linea">Hasta <input type="date" value={filtros.hasta ?? ''} onChange={(e) => cambiar('hasta', e.target.value)} /></label>
        {!cliente && <input type="search" placeholder="Código o cliente" defaultValue={filtros.buscar ?? ''} onKeyDown={(e) => e.key === 'Enter' && cambiar('buscar', e.currentTarget.value.trim())} aria-label="Buscar" />}
        {usuario.rol === 'vendedor' && (
          <label className="interruptor"><input type="checkbox" checked={Boolean(filtros.mios)} onChange={(e) => cambiar('mios', e.target.checked ? '1' : '')} /> Solo los míos</label>
        )}
      </div>
      <Contenido consulta={pedidos} vacio="No hay pedidos con esos filtros.">
        <div className="tabla">
          <table className="tabla-clic">
            <thead>
              <tr><th>Pedido</th><th>Fecha</th>{!cliente && <th>Cliente</th>}<th>Giro</th><th>Productos</th><th>Total</th><th>Vendedor</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {pedidos.datos?.map((p) => (
                <tr key={p.id} onClick={() => navegar(`/portal/pedidos/${p.id}`)}>
                  <td><Link to={`/portal/pedidos/${p.id}`}>{p.codigo}</Link></td>
                  <td>{fecha(p.creado_en)}</td>
                  {!cliente && <td>{p.cliente}</td>}
                  <td>{p.giro}</td>
                  <td>{p.total_productos}</td>
                  <td className="numero">{quetzales(p.total)}</td>
                  <td>{p.vendedor ?? '—'}</td>
                  <td><Estado valor={p.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Paginacion paginacion={pedidos.respuesta?.paginacion} onCambiar={(p) => cambiar('pagina', String(p))} />
    </>
  )
}
