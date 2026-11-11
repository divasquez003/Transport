import { Link } from 'react-router'
import { Contenido, Encabezado, Estado, Indicador } from '../../componentes/comunes.jsx'
import { Barras, Columnas, Medidor } from '../../componentes/Graficas.jsx'
import { ListaAlertas } from '../../componentes/ListaAlertas.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { fecha, fechaHora, numero, quetzales, quetzalesCorto } from '../../lib/formato.js'
import { esCentral, esCliente, esGestion } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const nombreMes = (texto) => `${MESES[Number(texto.slice(5, 7)) - 1]} ${texto.slice(2, 4)}`

// Ventas por mes de la vista vw_ventas_por_giro_mes: un total por mes con el desglose por giro
function ventasMensuales(filas) {
  const meses = new Map()
  for (const f of filas) {
    const mes = meses.get(f.mes) ?? { mes: f.mes, total: 0, giros: [] }
    mes.total += f.total
    mes.giros.push(f)
    meses.set(f.mes, mes)
  }
  return [...meses.values()]
}

function UltimasAlertas() {
  const alertas = useDatos('/alertas?limite=6')
  return (
    <section className="tarjeta-panel">
      <div className="fila-entre"><h2>Últimas alertas</h2><Link to="/portal/alertas">Ver todas</Link></div>
      <Contenido consulta={alertas} vacio="No tiene alertas.">
        <ListaAlertas alertas={alertas.datos ?? []} onCambio={alertas.recargar} />
      </Contenido>
    </section>
  )
}

function Observaciones({ lista }) {
  if (!lista?.length) return null
  return (
    <section className="tarjeta-panel observaciones">
      <h2>Puntos de atención</h2>
      <ul>{lista.map((o) => <li key={o}>{o}</li>)}</ul>
    </section>
  )
}

function Indicadores({ datos, resultado }) {
  return (
    <div className="indicadores">
      <Indicador titulo="Ingresos del mes" valor={quetzalesCorto(datos.ingresos)} detalle={quetzales(datos.ingresos)} />
      <Indicador titulo="Gastos del mes" valor={quetzalesCorto(datos.gastos)} detalle={quetzales(datos.gastos)} />
      <Indicador titulo="Resultado" valor={quetzalesCorto(resultado)} detalle={resultado < 0 ? 'Negativo' : 'Ingresos menos gastos'} tono={resultado < 0 ? 'negativo' : undefined} />
      <div className="indicador">
        <span className="indicador-titulo">Presupuesto del mes ejecutado</span>
        {datos.ejecucion_presupuesto == null ? <strong className="indicador-valor">—</strong> : <Medidor porcentaje={datos.ejecucion_presupuesto} />}
      </div>
      <Indicador titulo="Pedidos abiertos" valor={numero(datos.pedidos_abiertos)} />
      <Indicador titulo="Productos bajo mínimo" valor={numero(datos.productos_bajo_minimo)} tono={datos.productos_bajo_minimo ? 'aviso' : undefined} />
    </div>
  )
}

// Sede central: toda la corporación
function PanelCentral() {
  const consulta = useDatos('/reportes/consolidado')
  const r = consulta.datos
  return (
    <Contenido consulta={consulta}>
      {r && (
        <>
          <Indicadores datos={r.totales} resultado={r.totales.resultado} />
          <Observaciones lista={r.observaciones} />
          <div className="rejilla-panel">
            <section className="tarjeta-panel ancho-completo">
              <h2>Resultado del mes por giro</h2>
              <div className="tabla">
                <table>
                  <thead><tr><th>Giro</th><th className="numero">Ingresos</th><th className="numero">Gastos</th><th className="numero">Resultado</th><th className="columna-medidor">Presupuesto</th></tr></thead>
                  <tbody>
                    {r.giros.map((g) => (
                      <tr key={g.giro_id}>
                        <td>{g.giro}</td>
                        <td className="numero">{quetzalesCorto(g.ingresos + g.ingresos_internos)}</td>
                        <td className="numero">{quetzalesCorto(g.gastos)}</td>
                        <td className={`numero${g.resultado < 0 ? ' texto-alerta' : ''}`}>{quetzalesCorto(g.resultado)}</td>
                        <td>{g.ejecucion_presupuesto == null ? '—' : <Medidor porcentaje={g.ejecucion_presupuesto} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Link to="/portal/reportes">Ver el reporte consolidado →</Link>
            </section>
            <section className="tarjeta-panel">
              <h2>Ventas en línea de los últimos 6 meses</h2>
              <Columnas
                datos={ventasMensuales(r.tendencia_ventas)}
                valor={(m) => m.total}
                etiqueta={(m) => nombreMes(m.mes)}
                formato={quetzales}
                nombreSerie="Total"
                desglose={(m) => m.giros.map((g) => ({ nombre: g.giro, valor: quetzales(g.total) }))}
              />
            </section>
          </div>
        </>
      )}
    </Contenido>
  )
}

// Gerente o administrativo: su giro de negocio
function PanelGestion({ usuario }) {
  const consulta = useDatos(`/reportes/giros/${usuario.giro_id}`)
  const r = consulta.datos
  return (
    <Contenido consulta={consulta}>
      {r && (
        <>
          <Indicadores datos={r.indicadores} resultado={r.indicadores.resultado} />
          <Observaciones lista={r.observaciones} />
          <div className="rejilla-panel">
            <section className="tarjeta-panel">
              <h2>Ventas en línea por mes</h2>
              {r.ventas_por_mes.length
                ? <Columnas datos={r.ventas_por_mes} valor={(m) => m.total} etiqueta={(m) => nombreMes(m.mes)} formato={quetzales} nombreSerie="Ventas" />
                : <p className="vacio">Este giro no tiene ventas en línea en los últimos meses.</p>}
            </section>
            <section className="tarjeta-panel">
              <h2>Mejores clientes del mes</h2>
              {r.top_clientes.length ? (
                <Barras filas={r.top_clientes} etiqueta={(c) => c.nombre} formato={quetzalesCorto} series={[{ campo: 'total', nombre: 'Compras' }]} />
              ) : <p className="vacio">Sin compras este mes.</p>}
            </section>
          </div>
        </>
      )}
    </Contenido>
  )
}

function ListaPedidos({ ruta, titulo, vacio }) {
  const { usuario } = useSesion()
  const consulta = useDatos(ruta)
  return (
    <section className="tarjeta-panel">
      <div className="fila-entre"><h2>{titulo}</h2><Link to="/portal/pedidos">Ver todos</Link></div>
      <Contenido consulta={consulta} vacio={vacio}>
        <ul className="lista-filas">
          {consulta.datos?.map((p) => (
            <li key={p.id}>
              <Link to={`/portal/pedidos/${p.id}`}><strong>{p.codigo}</strong> · {esCliente(usuario) ? p.giro : p.cliente}</Link>
              <span>{quetzales(p.total)} <Estado valor={p.estado} /></span>
            </li>
          ))}
        </ul>
      </Contenido>
    </section>
  )
}

function ListaReuniones({ ruta }) {
  const consulta = useDatos(ruta)
  return (
    <section className="tarjeta-panel">
      <div className="fila-entre"><h2>Próximas reuniones</h2><Link to="/portal/reuniones">Ver todas</Link></div>
      <Contenido consulta={consulta} vacio="No hay reuniones pendientes.">
        <ul className="lista-filas">
          {consulta.datos?.map((r) => (
            <li key={r.id}>
              <span><strong>{fechaHora(r.fecha_hora)}</strong> · {r.asunto}</span>
              <Estado valor={r.estado} />
            </li>
          ))}
        </ul>
      </Contenido>
    </section>
  )
}

function ListaViajes({ ruta, titulo }) {
  const consulta = useDatos(ruta)
  return (
    <section className="tarjeta-panel">
      <div className="fila-entre"><h2>{titulo}</h2><Link to="/portal/viajes">Ver todos</Link></div>
      <Contenido consulta={consulta} vacio="No hay viajes.">
        <ul className="lista-filas">
          {consulta.datos?.map((v) => (
            <li key={v.id}>
              <Link to={`/portal/viajes/${v.id}`}><strong>{v.codigo}</strong> · {v.origen} → {v.destino}</Link>
              <span>{fecha(v.salida_programada)} <Estado valor={v.estado} /></span>
            </li>
          ))}
        </ul>
      </Contenido>
    </section>
  )
}

function PanelCliente() {
  return (
    <>
      <div className="accesos">
        <Link className="acceso" to="/catalogo"><strong>Hacer un pedido</strong><span>Catálogo en línea</span></Link>
        <Link className="acceso" to="/maquinaria"><strong>Alquilar maquinaria</strong><span>Disponibilidad por fechas</span></Link>
        <Link className="acceso" to="/portal/reuniones"><strong>Agendar reunión</strong><span>Cotizaciones con un vendedor</span></Link>
        <Link className="acceso" to="/portal/mensajes"><strong>Escribirnos</strong><span>Mensajes con la empresa</span></Link>
      </div>
      <div className="rejilla-panel">
        <ListaPedidos ruta="/pedidos?por_pagina=5" titulo="Mis últimos pedidos" vacio="Todavía no tiene pedidos." />
        <ListaViajes ruta="/viajes?por_pagina=5" titulo="Mis viajes" />
        <ListaReuniones ruta="/reuniones?por_pagina=5" />
        <UltimasAlertas />
      </div>
    </>
  )
}

// Accesos directos del personal operativo según su giro
function AccesosOperativo({ usuario }) {
  const codigo = usuario.giro_codigo
  const accesos = [
    codigo === 'MINERIA' && ['/portal/produccion', 'Registrar extracción', 'Producción del turno'],
    codigo === 'PROCESO' && ['/portal/produccion', 'Órdenes de producción', 'Registrar lo producido'],
    codigo?.startsWith('TRANSP') && ['/portal/viajes?mios=1', 'Mis viajes', 'Iniciar y entregar'],
    ['/portal/inventario', 'Inventario', 'Existencias de mi sede'],
    ['/portal/pedidos-internos', 'Pedidos entre giros', 'Despachos y recepciones']
  ].filter(Boolean)
  return (
    <div className="accesos">
      {accesos.map(([ruta, titulo, texto]) => <Link key={ruta} className="acceso" to={ruta}><strong>{titulo}</strong><span>{texto}</span></Link>)}
    </div>
  )
}

export default function Panel() {
  const { usuario } = useSesion()
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const subtitulo = esCliente(usuario) ? usuario.cliente : usuario.giro ?? 'Sede central: vista de todos los giros de negocio'

  return (
    <>
      <Encabezado titulo={`${saludo}, ${usuario.nombre.split(' ')[0]}`} descripcion={subtitulo} />
      {esCliente(usuario) && <PanelCliente />}
      {esCentral(usuario) && <PanelCentral />}
      {!esCentral(usuario) && esGestion(usuario) && <PanelGestion usuario={usuario} />}
      {usuario.rol === 'operativo' && <AccesosOperativo usuario={usuario} />}
      {!esCliente(usuario) && (
        <div className="rejilla-panel">
          {usuario.rol === 'vendedor' && <ListaPedidos ruta="/pedidos?mios=1&por_pagina=6" titulo="Mis pedidos asignados" vacio="No tiene pedidos asignados." />}
          {usuario.rol === 'vendedor' && <ListaReuniones ruta="/reuniones?mias=1&estado=confirmada&por_pagina=6" />}
          {usuario.rol === 'operativo' && <ListaViajes ruta="/viajes?mios=1&por_pagina=6" titulo="Mis viajes asignados" />}
          {esGestion(usuario) && !esCentral(usuario) && <ListaPedidos ruta="/pedidos?estado=pendiente&por_pagina=6" titulo="Pedidos por confirmar" vacio="No hay pedidos pendientes." />}
          <UltimasAlertas />
        </div>
      )}
    </>
  )
}
