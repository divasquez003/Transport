import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Barra, Contenido, Encabezado, Estado, Indicador, Pestanas } from '../../componentes/comunes.jsx'
import { Barras, BarrasDivergentes, Columnas, Medidor } from '../../componentes/Graficas.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, descargar } from '../../lib/api.js'
import { etiqueta, fecha, hoy, numero, porcentaje, quetzales, quetzalesCorto, sumarDias, TIPOS_RUTA, unidad } from '../../lib/formato.js'
import { esCentral, esCliente } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const nombreMes = (texto) => `${MESES[Number(String(texto).slice(5, 7)) - 1]} ${String(texto).slice(2, 4)}`

// Periodos rápidos para todos los reportes
function mesAnterior() {
  const inicio = sumarDias(`${hoy().slice(0, 7)}-01`, -1).slice(0, 7)
  return { desde: `${inicio}-01`, hasta: sumarDias(`${hoy().slice(0, 7)}-01`, -1) }
}

const PERIODOS = {
  mes: () => ({ desde: `${hoy().slice(0, 7)}-01`, hasta: hoy() }),
  anterior: mesAnterior,
  trimestre: () => ({ desde: sumarDias(hoy(), -90), hasta: hoy() }),
  semestre: () => ({ desde: sumarDias(hoy(), -180), hasta: hoy() }),
  anio: () => ({ desde: `${hoy().slice(0, 4)}-01-01`, hasta: hoy() })
}

export default function Reportes() {
  const { usuario } = useSesion()
  const [parametros] = useSearchParams()
  const clienteId = parametros.get('cliente_id')
  if (esCliente(usuario)) return <EstadoCuenta clienteId={usuario.cliente_id} />
  if (clienteId) return <EstadoCuenta clienteId={clienteId} />
  return <ReportesGestion />
}

function FiltroPeriodo({ periodo, onCambiar }) {
  const [preset, setPreset] = useState('mes')
  return (
    <div className="filtros">
      <select value={preset} onChange={(e) => { setPreset(e.target.value); if (PERIODOS[e.target.value]) onCambiar(PERIODOS[e.target.value]()) }} aria-label="Periodo">
        <option value="mes">Mes en curso</option>
        <option value="anterior">Mes anterior</option>
        <option value="trimestre">Últimos 90 días</option>
        <option value="semestre">Últimos 180 días</option>
        <option value="anio">Este año</option>
        <option value="otro">Personalizado</option>
      </select>
      {preset === 'otro' && (
        <>
          <label className="campo-linea">Desde <input type="date" value={periodo.desde} max={periodo.hasta} onChange={(e) => onCambiar({ ...periodo, desde: e.target.value })} /></label>
          <label className="campo-linea">Hasta <input type="date" value={periodo.hasta} min={periodo.desde} onChange={(e) => onCambiar({ ...periodo, hasta: e.target.value })} /></label>
        </>
      )}
      <span className="ayuda">{fecha(periodo.desde)} al {fecha(periodo.hasta)}</span>
    </div>
  )
}

function ReportesGestion() {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const central = esCentral(usuario)
  const [vista, setVista] = useState(central ? 'consolidado' : 'giro')
  const [periodo, setPeriodo] = useState(PERIODOS.mes())

  const exportar = async (reporte, extra = {}) => {
    try {
      avisos.exito(`Descargado: ${await descargar(`/reportes/exportar${consulta({ reporte, ...periodo, ...extra })}`)}`)
    } catch (error) {
      avisos.error(error)
    }
  }

  const opciones = [
    ...(central ? [{ id: 'consolidado', texto: 'Consolidado' }] : []),
    { id: 'giro', texto: central ? 'Por giro' : 'Mi giro' },
    { id: 'ventas', texto: 'Ventas' },
    { id: 'presupuesto', texto: 'Presupuesto anual' }
  ]

  return (
    <>
      <Encabezado titulo="Reportes" descripcion={central ? 'Información consolidada de todos los giros para la toma de decisiones.' : `Indicadores de ${usuario.giro}.`} />
      <Pestanas opciones={opciones} activa={vista} onCambiar={setVista} />
      {vista !== 'presupuesto' && <FiltroPeriodo periodo={periodo} onCambiar={setPeriodo} />}
      {vista === 'consolidado' && <Consolidado periodo={periodo} onExportar={() => exportar('consolidado')} />}
      {vista === 'giro' && <ReporteGiro periodo={periodo} onExportarInventario={() => exportar('inventario')} />}
      {vista === 'ventas' && <Ventas periodo={periodo} onExportar={(agrupar) => exportar('ventas', { agrupar })} />}
      {vista === 'presupuesto' && <PresupuestoAnual onExportar={(anio) => exportar('presupuesto', { anio })} />}
    </>
  )
}

function Observaciones({ lista }) {
  if (!lista?.length) return <p className="exito">Sin puntos de atención en el periodo.</p>
  return <ul className="observaciones-lista">{lista.map((o) => <li key={o}>⚠ {o}</li>)}</ul>
}

function Consolidado({ periodo, onExportar }) {
  const datos = useDatos(`/reportes/consolidado${consulta(periodo)}`)
  const r = datos.datos
  return (
    <Contenido consulta={datos}>
      {r && (
        <div className={datos.cargando ? 'recargando' : ''}>
          <div className="indicadores">
            <Indicador titulo="Ingresos de clientes" valor={quetzalesCorto(r.totales.ingresos)} detalle={quetzales(r.totales.ingresos)} />
            <Indicador titulo="Gastos" valor={quetzalesCorto(r.totales.gastos)} detalle={quetzales(r.totales.gastos)} />
            <Indicador titulo="Resultado consolidado" valor={quetzalesCorto(r.totales.resultado)} detalle="Sin ventas entre giros" tono={r.totales.resultado < 0 ? 'negativo' : undefined} />
            <div className="indicador"><span className="indicador-titulo">Presupuesto ejecutado</span>{r.totales.ejecucion_presupuesto == null ? <strong className="indicador-valor">—</strong> : <Medidor porcentaje={r.totales.ejecucion_presupuesto} />}</div>
          </div>
          <section className="tarjeta-panel">
            <h2>Puntos de atención</h2>
            <Observaciones lista={r.observaciones} />
          </section>
          <section className="tarjeta-panel">
            <div className="fila-entre"><h2>Resultado por giro</h2><button type="button" className="boton boton-secundario boton-chico" onClick={onExportar}>Exportar a Excel (CSV)</button></div>
            <BarrasDivergentes filas={r.giros} etiqueta={(g) => g.giro} valor={(g) => g.resultado} formato={quetzalesCorto} />
            <div className="tabla">
              <table>
                <thead>
                  <tr><th>Giro</th><th className="numero">Pedidos</th><th className="numero">Ventas</th><th className="numero">Alquileres</th><th className="numero">Viajes</th><th className="numero">Obras</th><th className="numero">Ingresos</th><th className="numero">Internos</th><th className="numero">Gastos</th><th className="numero">Resultado</th><th className="numero">Presupuesto</th><th className="numero">Abiertos</th><th className="numero">Bajo mín.</th></tr>
                </thead>
                <tbody>
                  {r.giros.map((g) => (
                    <tr key={g.giro_id}>
                      <td>{g.giro}</td>
                      <td className="numero">{g.pedidos}</td>
                      <td className="numero">{quetzalesCorto(g.ventas)}</td>
                      <td className="numero">{quetzalesCorto(g.ingresos_alquileres)}</td>
                      <td className="numero">{quetzalesCorto(g.ingresos_viajes)}</td>
                      <td className="numero">{quetzalesCorto(g.ingresos_obras)}</td>
                      <td className="numero"><strong>{quetzalesCorto(g.ingresos)}</strong></td>
                      <td className="numero">{quetzalesCorto(g.ingresos_internos)}</td>
                      <td className="numero">{quetzalesCorto(g.gastos)}</td>
                      <td className={`numero${g.resultado < 0 ? ' texto-alerta' : ''}`}>{quetzalesCorto(g.resultado)}</td>
                      <td className="numero">{porcentaje(g.ejecucion_presupuesto)}</td>
                      <td className="numero">{g.pedidos_abiertos}</td>
                      <td className="numero">{g.productos_bajo_minimo}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><th>Total</th><th className="numero">{r.totales.pedidos}</th><th colSpan={4} /><th className="numero">{quetzalesCorto(r.totales.ingresos)}</th><th /><th className="numero">{quetzalesCorto(r.totales.gastos)}</th><th className="numero">{quetzalesCorto(r.totales.resultado)}</th><th className="numero">{porcentaje(r.totales.ejecucion_presupuesto)}</th><th className="numero">{r.totales.pedidos_abiertos}</th><th className="numero">{r.totales.productos_bajo_minimo}</th></tr>
                </tfoot>
              </table>
            </div>
            <p className="ayuda">«Obras» es lo facturado por avance de los proyectos de construcción. «Internos» son ventas entre giros (pedidos entre giros y viajes internos): cuentan para el resultado de cada giro, pero no para el consolidado. Los montos exactos están en la exportación a Excel.</p>
          </section>
        </div>
      )}
    </Contenido>
  )
}

function ReporteGiro({ periodo, onExportarInventario }) {
  const { usuario } = useSesion()
  const central = esCentral(usuario)
  const giros = useDatos(central ? '/giros' : null)
  const [giroId, setGiroId] = useState(central ? '2' : String(usuario.giro_id))
  const datos = useDatos(`/reportes/giros/${giroId}${consulta(periodo)}`)
  const r = datos.datos
  return (
    <>
      {central && (
        <div className="filtros">
          <select value={giroId} onChange={(e) => setGiroId(e.target.value)} aria-label="Giro">
            {giros.datos?.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </div>
      )}
      <Contenido consulta={datos}>
        {r && (
          <div className={datos.cargando ? 'recargando' : ''}>
            <div className="indicadores">
              <Indicador titulo="Ingresos de clientes" valor={quetzalesCorto(r.indicadores.ingresos)} detalle={quetzales(r.indicadores.ingresos)} />
              <Indicador titulo="Ventas entre giros" valor={quetzalesCorto(r.indicadores.ingresos_internos)} />
              <Indicador titulo="Gastos" valor={quetzalesCorto(r.indicadores.gastos)} detalle={quetzales(r.indicadores.gastos)} />
              <Indicador titulo="Resultado" valor={quetzalesCorto(r.indicadores.resultado)} tono={r.indicadores.resultado < 0 ? 'negativo' : undefined} />
              <div className="indicador"><span className="indicador-titulo">Presupuesto ejecutado</span>{r.indicadores.ejecucion_presupuesto == null ? <strong className="indicador-valor">—</strong> : <Medidor porcentaje={r.indicadores.ejecucion_presupuesto} />}</div>
              <Indicador titulo="Pedidos abiertos" valor={numero(r.indicadores.pedidos_abiertos)} />
            </div>
            <section className="tarjeta-panel"><h2>Puntos de atención</h2><Observaciones lista={r.observaciones} /></section>
            <div className="rejilla-panel">
              <section className="tarjeta-panel">
                <h2>Ventas en línea por mes</h2>
                {r.ventas_por_mes.length ? <Columnas datos={r.ventas_por_mes} valor={(m) => m.total} etiqueta={(m) => nombreMes(m.mes)} formato={quetzales} nombreSerie="Ventas" /> : <p className="vacio">Sin ventas en línea.</p>}
              </section>
              <section className="tarjeta-panel">
                <h2>Mejores clientes</h2>
                {r.top_clientes.length ? <Barras filas={r.top_clientes} etiqueta={(c) => c.nombre} formato={quetzalesCorto} series={[{ campo: 'total', nombre: 'Compras' }]} /> : <p className="vacio">Sin compras en el periodo.</p>}
              </section>
              <section className="tarjeta-panel">
                <h2>Productos más vendidos</h2>
                {r.ventas_por_producto.length ? <Barras filas={r.ventas_por_producto} etiqueta={(p) => p.etiqueta} formato={quetzalesCorto} series={[{ campo: 'total', nombre: 'Ventas' }]} /> : <p className="vacio">Sin ventas en el periodo.</p>}
              </section>
              <section className="tarjeta-panel">
                <h2>Gastos por categoría</h2>
                {r.gastos_por_categoria.length ? <Barras filas={r.gastos_por_categoria} etiqueta={(g) => etiqueta(g.categoria)} formato={quetzalesCorto} series={[{ campo: 'total', nombre: 'Gasto' }]} /> : <p className="vacio">Sin gastos en el periodo.</p>}
              </section>
            </div>
            <Especifico r={r} />
            {r.inventario.length > 0 && (
              <section className="tarjeta-panel">
                <div className="fila-entre"><h2>Inventario por sede</h2><button type="button" className="boton boton-secundario boton-chico" onClick={onExportarInventario}>Exportar existencias (CSV)</button></div>
                <ul className="lista-filas">
                  {r.inventario.map((s) => <li key={s.sede_id}><span>{s.sede}: {s.productos} productos</span>{Number(s.bajo_minimo) > 0 ? <Estado valor="cancelado" texto={`⚠ ${s.bajo_minimo} bajo mínimo`} /> : <Estado valor="entregado" texto="Suficiente" />}</li>)}
                </ul>
              </section>
            )}
          </div>
        )}
      </Contenido>
    </>
  )
}

// Información propia de cada giro de negocio
function Especifico({ r }) {
  return (
    <>
      {r.extraccion && (
        <section className="tarjeta-panel">
          <h2>Extracción por planta</h2>
          {r.extraccion.length ? (
            <div className="tabla"><table>
              <thead><tr><th>Planta</th><th>Materia prima</th><th>Total</th><th>Turnos</th></tr></thead>
              <tbody>{r.extraccion.map((x) => <tr key={`${x.sede}-${x.producto}`}><td>{x.sede}</td><td>{x.producto}</td><td className="numero">{numero(x.total)} {unidad(x.unidad_medida, x.total)}</td><td className="numero">{x.turnos}</td></tr>)}</tbody>
            </table></div>
          ) : <p className="vacio">Sin extracción en el periodo.</p>}
        </section>
      )}
      {r.ordenes_produccion && (
        <section className="tarjeta-panel">
          <h2>Órdenes de producción</h2>
          <ul className="lista-filas">
            {r.ordenes_produccion.map((o) => <li key={o.estado}><span><Estado valor={o.estado} /> {o.ordenes} {o.ordenes === 1 ? 'orden' : 'órdenes'}</span><span>{numero(o.producido)} de {numero(o.planificado)} producidos</span></li>)}
          </ul>
        </section>
      )}
      {r.utilizacion_maquinas && (
        <section className="tarjeta-panel">
          <h2>Utilización de la maquinaria</h2>
          <div className="tabla"><table>
            <thead><tr><th>Máquina</th><th>Días alquilada</th><th className="columna-medidor">Utilización</th><th>Ingresos</th><th>Estado</th></tr></thead>
            <tbody>
              {r.utilizacion_maquinas.map((m) => (
                <tr key={m.id}><td>{m.tipo} {m.codigo}</td><td className="numero">{numero(m.dias_alquilada)}</td><td><Barra valor={m.utilizacion} /> <small>{numero(m.utilizacion)} %</small></td><td className="numero">{quetzales(m.ingresos)}</td><td><Estado valor={m.estado} /></td></tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
      {r.viajes_por_ruta && (
        <section className="tarjeta-panel">
          <h2>Viajes por tipo de ruta</h2>
          {r.viajes_por_ruta.length ? (
            <div className="tabla"><table>
              <thead><tr><th>Ruta</th><th>Viajes</th><th>Entregados</th><th>Ingresos</th><th>Duración promedio</th></tr></thead>
              <tbody>{r.viajes_por_ruta.map((v) => <tr key={v.tipo_ruta}><td>{TIPOS_RUTA[v.tipo_ruta]}</td><td className="numero">{v.viajes}</td><td className="numero">{v.entregados}</td><td className="numero">{quetzales(v.ingresos)}</td><td className="numero">{v.minutos_promedio ? `${Math.floor(v.minutos_promedio / 60)} h ${v.minutos_promedio % 60} min` : '—'}</td></tr>)}</tbody>
            </table></div>
          ) : <p className="vacio">Sin viajes en el periodo.</p>}
        </section>
      )}
      {r.proyectos && (
        <section className="tarjeta-panel">
          <h2>Proyectos</h2>
          <div className="tabla"><table>
            <thead><tr><th>Proyecto</th><th>Cliente</th><th>Contrato</th><th className="columna-medidor">Avance</th><th>Situación</th></tr></thead>
            <tbody>
              {r.proyectos.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/portal/proyectos/${p.id}`}>{p.codigo}</Link> {p.nombre}</td><td>{p.cliente}</td><td className="numero">{quetzalesCorto(p.monto_contrato)}</td>
                  <td><Barra valor={p.avance_porcentaje} esperado={p.avance_esperado} alerta={p.situacion === 'atrasado'} /> <small>{numero(p.avance_porcentaje)} %</small></td>
                  <td>{etiqueta(p.situacion)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </>
  )
}

const AGRUPACIONES = { mes: 'Mes', dia: 'Día', giro: 'Giro de negocio', producto: 'Producto', cliente: 'Cliente', vendedor: 'Vendedor' }

function Ventas({ periodo, onExportar }) {
  const { usuario } = useSesion()
  const [agrupar, setAgrupar] = useState('producto')
  const datos = useDatos(`/reportes/ventas${consulta({ ...periodo, agrupar })}`)
  const filas = datos.datos ?? []
  const temporal = agrupar === 'mes' || agrupar === 'dia'
  return (
    <section className="tarjeta-panel">
      <div className="filtros">
        <label className="campo-linea">Agrupar por
          <select value={agrupar} onChange={(e) => setAgrupar(e.target.value)}>
            {Object.entries(AGRUPACIONES).filter(([k]) => k !== 'giro' || esCentral(usuario)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {datos.respuesta && <strong>Total: {quetzales(datos.respuesta.total)}</strong>}
        <button type="button" className="boton boton-secundario boton-chico" onClick={() => onExportar(agrupar)}>Exportar a Excel (CSV)</button>
      </div>
      <Contenido consulta={datos} vacio="Sin ventas en el periodo.">
        <div className={datos.cargando ? 'recargando' : ''}>
          {temporal
            ? <Columnas datos={filas} valor={(f) => f.total} etiqueta={(f) => (agrupar === 'mes' ? nombreMes(f.etiqueta) : fecha(f.etiqueta).slice(0, 5))} formato={quetzales} nombreSerie="Ventas" />
            : <Barras filas={filas.slice(0, 15)} etiqueta={(f) => f.etiqueta} formato={quetzalesCorto} series={[{ campo: 'total', nombre: 'Ventas' }]} />}
          <div className="tabla">
            <table>
              <thead><tr><th>{AGRUPACIONES[agrupar]}</th><th>Pedidos</th>{agrupar === 'producto' && <th>Cantidad</th>}<th>Total</th>{agrupar !== 'producto' && <th>Promedio por pedido</th>}</tr></thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.clave ?? 'sin'}>
                    <td>{f.etiqueta}{f.giro && agrupar === 'producto' ? <small> · {f.giro}</small> : null}</td>
                    <td className="numero">{f.pedidos}</td>
                    {agrupar === 'producto' && <td className="numero">{numero(f.cantidad)} {unidad(f.unidad_medida, f.cantidad)}</td>}
                    <td className="numero">{quetzales(f.total)}</td>
                    {agrupar !== 'producto' && <td className="numero">{quetzales(f.promedio)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Contenido>
    </section>
  )
}

function PresupuestoAnual({ onExportar }) {
  const [anio, setAnio] = useState(Number(hoy().slice(0, 4)))
  const datos = useDatos(`/reportes/presupuesto?anio=${anio}`)
  const r = datos.datos
  return (
    <>
      <div className="filtros">
        <label className="campo-linea">Año <input type="number" min="2020" max="2100" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="campo-anio" /></label>
        <button type="button" className="boton boton-secundario boton-chico" onClick={() => onExportar(anio)}>Exportar a Excel (CSV)</button>
      </div>
      <Contenido consulta={datos}>
        {r && (
          <>
            <div className="indicadores">
              <Indicador titulo={`Presupuesto ${anio}`} valor={quetzalesCorto(r.totales.presupuesto)} detalle={quetzales(r.totales.presupuesto)} />
              <Indicador titulo="Gastado" valor={quetzalesCorto(r.totales.gastado)} detalle={quetzales(r.totales.gastado)} />
              <Indicador titulo="Disponible" valor={quetzalesCorto(r.totales.disponible)} tono={r.totales.disponible < 0 ? 'negativo' : undefined} />
            </div>
            <section className="tarjeta-panel">
              <h2>Ejecución mensual por giro</h2>
              {r.meses.length ? (
                <div className="tabla"><table>
                  <thead><tr><th>Giro</th><th>Mes</th><th>Presupuesto</th><th>Gastado</th><th>Disponible</th><th className="columna-medidor">Ejecución</th></tr></thead>
                  <tbody>
                    {r.meses.map((m) => (
                      <tr key={`${m.giro_id}-${m.mes}`}><td>{m.giro}</td><td>{MESES[m.mes - 1]}</td><td className="numero">{quetzales(m.presupuesto)}</td><td className="numero">{quetzales(m.gastado)}</td><td className="numero">{quetzales(m.disponible)}</td><td><Medidor porcentaje={m.porcentaje} /></td></tr>
                    ))}
                  </tbody>
                </table></div>
              ) : <p className="vacio">Sin presupuesto para {anio}.</p>}
            </section>
            {r.gastos_por_categoria.length > 0 && (
              <section className="tarjeta-panel">
                <h2>Gastos del año por categoría</h2>
                <Barras filas={r.gastos_por_categoria.slice(0, 15)} etiqueta={(g) => `${etiqueta(g.categoria)} · ${g.giro}`} formato={quetzalesCorto} series={[{ campo: 'total', nombre: 'Gasto' }]} />
              </section>
            )}
          </>
        )}
      </Contenido>
    </>
  )
}

// Estado de cuenta del cliente: compras por giro, por mes, alquileres, viajes y proyectos
function EstadoCuenta({ clienteId }) {
  const { usuario } = useSesion()
  const [periodo, setPeriodo] = useState({ desde: sumarDias(hoy(), -365), hasta: hoy() })
  const datos = useDatos(`/reportes/clientes/${clienteId}${consulta(periodo)}`)
  const r = datos.datos
  return (
    <>
      <Encabezado titulo={esCliente(usuario) ? 'Estado de cuenta' : `Estado de cuenta: ${r?.cliente.nombre ?? ''}`} descripcion="Su relación comercial con todos los giros de negocio de TransPort." />
      {!esCliente(usuario) && <p className="miga"><Link to={`/portal/clientes/${clienteId}`}>← Ficha del cliente</Link></p>}
      <div className="filtros">
        <label className="campo-linea">Desde <input type="date" value={periodo.desde} max={periodo.hasta} onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })} /></label>
        <label className="campo-linea">Hasta <input type="date" value={periodo.hasta} min={periodo.desde} onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value })} /></label>
      </div>
      <Contenido consulta={datos}>
        {r && (
          <>
            <div className="indicadores">
              <Indicador titulo="Compras en el periodo" valor={quetzalesCorto(r.total_pedidos)} detalle={quetzales(r.total_pedidos)} />
              <Indicador titulo="Alquileres" valor={quetzalesCorto(r.alquileres.total)} detalle={`${r.alquileres.alquileres} alquileres`} />
              <Indicador titulo="Fletes y viajes" valor={quetzalesCorto(r.viajes.total)} detalle={`${r.viajes.viajes} viajes`} />
              <Indicador titulo="Proyectos" valor={numero(r.proyectos.length)} />
            </div>
            <div className="rejilla-panel">
              <section className="tarjeta-panel">
                <h2>Compras por mes</h2>
                {r.por_mes.length ? <Columnas datos={r.por_mes} valor={(m) => m.total} etiqueta={(m) => nombreMes(m.mes)} formato={quetzales} nombreSerie="Compras" /> : <p className="vacio">Sin compras en el periodo.</p>}
              </section>
              <section className="tarjeta-panel">
                <h2>Compras por giro de negocio</h2>
                {r.por_giro.length ? <Barras filas={r.por_giro} etiqueta={(g) => g.giro} formato={quetzalesCorto} series={[{ campo: 'total', nombre: 'Compras' }]} /> : <p className="vacio">Sin compras en el periodo.</p>}
              </section>
              <section className="tarjeta-panel">
                <h2>Últimos pedidos</h2>
                <ul className="lista-filas">
                  {r.ultimos_pedidos.map((p) => <li key={p.id}><Link to={`/portal/pedidos/${p.id}`}>{p.codigo}</Link><span>{p.giro} · {quetzales(p.total)} <Estado valor={p.estado} /></span></li>)}
                </ul>
              </section>
              {r.proyectos.length > 0 && (
                <section className="tarjeta-panel">
                  <h2>Proyectos</h2>
                  <ul className="lista-filas">
                    {r.proyectos.map((p) => <li key={p.id}><Link to={`/portal/proyectos/${p.id}`}>{p.codigo} {p.nombre}</Link><span>{numero(p.avance_porcentaje)} % <Estado valor={p.estado} /></span></li>)}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </Contenido>
    </>
  )
}
