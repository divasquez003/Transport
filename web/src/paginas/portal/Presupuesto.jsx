import { useState } from 'react'
import { Campo, Contenido, Encabezado, Indicador, Paginacion } from '../../componentes/comunes.jsx'
import { Medidor } from '../../componentes/Graficas.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar } from '../../lib/api.js'
import { etiqueta, fecha, hoy, quetzales } from '../../lib/formato.js'
import { esCentral } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function Presupuesto() {
  const { usuario } = useSesion()
  const central = esCentral(usuario)
  const [periodo, setPeriodo] = useState({ anio: Number(hoy().slice(0, 4)), mes: Number(hoy().slice(5, 7)), giro_id: '' })
  const presupuestos = useDatos(`/presupuestos${consulta(periodo)}`)
  const giros = useDatos(central ? '/giros' : null)
  const [asignar, setAsignar] = useState(false)
  const r = presupuestos.respuesta?.resumen

  // Los gastos se filtran por el mismo mes
  const ultimoDia = new Date(Date.UTC(periodo.anio, periodo.mes, 0)).getUTCDate()
  const rango = { desde: `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-01`, hasta: `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-${ultimoDia}` }

  return (
    <>
      <Encabezado titulo="Presupuesto y gastos" descripcion="Cada giro lleva su presupuesto mensual; las alertas avisan al llegar al 80 % y al 100 %.">
        {central && <button type="button" className="boton" onClick={() => setAsignar(true)}>Asignar presupuesto</button>}
      </Encabezado>
      <div className="filtros">
        <select value={periodo.mes} onChange={(e) => setPeriodo({ ...periodo, mes: Number(e.target.value) })} aria-label="Mes">
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" min="2020" max="2100" value={periodo.anio} onChange={(e) => setPeriodo({ ...periodo, anio: Number(e.target.value) })} aria-label="Año" className="campo-anio" />
        {central && (
          <select value={periodo.giro_id} onChange={(e) => setPeriodo({ ...periodo, giro_id: e.target.value })} aria-label="Giro">
            <option value="">Todos los giros</option>
            {giros.datos?.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        )}
      </div>
      {r && (
        <div className="indicadores">
          <Indicador titulo="Presupuesto del mes" valor={quetzales(r.presupuesto)} />
          <Indicador titulo="Gastado" valor={quetzales(r.gastado)} />
          <Indicador titulo="Disponible" valor={quetzales(r.disponible)} tono={r.disponible < 0 ? 'negativo' : undefined} />
          <div className="indicador"><span className="indicador-titulo">Ejecutado</span>{r.porcentaje == null ? <strong className="indicador-valor">—</strong> : <Medidor porcentaje={r.porcentaje} />}</div>
        </div>
      )}
      <section className="tarjeta-panel">
        <h2>Presupuesto contra gasto · {MESES[periodo.mes - 1]} {periodo.anio}</h2>
        <Contenido consulta={presupuestos} vacio="No hay presupuesto asignado para este mes.">
          <div className="tabla">
            <table>
              <thead><tr><th>Giro</th><th>Categoría</th><th>Presupuesto</th><th>Gastado</th><th>Disponible</th><th className="columna-medidor">Ejecución</th></tr></thead>
              <tbody>
                {presupuestos.datos?.map((p) => (
                  <tr key={p.id}>
                    <td>{p.giro}</td>
                    <td>{etiqueta(p.categoria)}</td>
                    <td className="numero">{quetzales(p.monto)}</td>
                    <td className="numero">{quetzales(p.gastado)}</td>
                    <td className={`numero${p.disponible < 0 ? ' texto-alerta' : ''}`}>{quetzales(p.disponible)}</td>
                    <td><Medidor porcentaje={p.porcentaje} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Contenido>
      </section>
      <Gastos rango={rango} giroId={periodo.giro_id} giros={giros.datos} onCambio={presupuestos.recargar} />
      {asignar && <AsignarPresupuesto periodo={periodo} giros={giros.datos ?? []} onCerrar={() => setAsignar(false)} onListo={() => { setAsignar(false); presupuestos.recargar() }} />}
    </>
  )
}

function Gastos({ rango, giroId, giros, onCambio }) {
  const [categoria, setCategoria] = useState('')
  const [pagina, setPagina] = useState(1)
  const gastos = useDatos(`/gastos${consulta({ ...rango, giro_id: giroId, categoria, pagina })}`)
  const [nuevo, setNuevo] = useState(false)
  return (
    <section className="tarjeta-panel">
      <div className="fila-entre">
        <h2>Gastos del mes</h2>
        <button type="button" className="boton" onClick={() => setNuevo(true)}>Registrar gasto</button>
      </div>
      <div className="filtros">
        <input type="search" placeholder="Categoría (combustible, planilla...)" aria-label="Categoría"
          onKeyDown={(e) => { if (e.key === 'Enter') { setCategoria(e.currentTarget.value.trim()); setPagina(1) } }} />
        {gastos.respuesta && <strong>Total: {quetzales(gastos.respuesta.total_monto)}</strong>}
      </div>
      <Contenido consulta={gastos} vacio="No hay gastos en el periodo.">
        <div className="tabla">
          <table>
            <thead><tr><th>Fecha</th><th>Giro</th><th>Sede</th><th>Categoría</th><th>Descripción</th><th>Documento</th><th>Monto</th></tr></thead>
            <tbody>
              {gastos.datos?.map((g) => (
                <tr key={g.id}>
                  <td>{fecha(g.fecha)}</td><td>{g.giro}</td><td>{g.sede ?? '—'}</td><td>{etiqueta(g.categoria)}</td>
                  <td>{g.descripcion}</td><td>{g.documento ?? '—'}</td><td className="numero">{quetzales(g.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Paginacion paginacion={gastos.respuesta?.paginacion} onCambiar={setPagina} />
      {nuevo && <RegistrarGasto giros={giros} onCerrar={() => setNuevo(false)} onListo={() => { setNuevo(false); gastos.recargar(); onCambio() }} />}
    </section>
  )
}

function RegistrarGasto({ giros, onCerrar, onListo }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const central = esCentral(usuario)
  const [giroId, setGiroId] = useState(central ? '' : String(usuario.giro_id))
  const sedes = useDatos(giroId ? `/sedes?giro_id=${giroId}` : null)

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    for (const campo of ['giro_id', 'sede_id', 'monto']) if (datos[campo]) datos[campo] = Number(datos[campo])
    try {
      const g = await enviar('/gastos', datos)
      const pm = g.presupuesto_mes
      avisos.exito(`Gasto registrado${pm ? `. Presupuesto del mes al ${pm.porcentaje} %` : ''}`)
      onListo()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo="Registrar gasto" onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        {central && (
          <Campo etiqueta="Giro">
            <select name="giro_id" required value={giroId} onChange={(e) => setGiroId(e.target.value)}>
              <option value="" disabled>Seleccione</option>
              {giros?.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </Campo>
        )}
        <div className="rejilla-campos">
          <Campo etiqueta="Sede (opcional)">
            <select name="sede_id" defaultValue="">
              <option value="">General del giro</option>
              {sedes.datos?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Categoría"><input name="categoria" required maxLength={60} list="categorias-gasto" placeholder="combustible" /></Campo>
          <Campo etiqueta="Monto (Q)"><input name="monto" type="number" min="0.01" step="0.01" required /></Campo>
          <Campo etiqueta="Fecha"><input name="fecha" type="date" max={hoy()} defaultValue={hoy()} /></Campo>
          <Campo etiqueta="Documento (factura)"><input name="documento" maxLength={50} /></Campo>
        </div>
        <datalist id="categorias-gasto">
          {['combustible', 'planilla', 'mantenimiento', 'repuestos', 'energia', 'materia_prima', 'materiales', 'peajes', 'subcontratos'].map((c) => <option key={c} value={c} />)}
        </datalist>
        <Campo etiqueta="Descripción"><input name="descripcion" required maxLength={255} /></Campo>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Registrar</button>
        </div>
      </form>
    </Modal>
  )
}

function AsignarPresupuesto({ periodo, giros, onCerrar, onListo }) {
  const avisos = useAvisos()
  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    for (const campo of ['giro_id', 'anio', 'mes', 'monto']) datos[campo] = Number(datos[campo])
    try {
      const p = await enviar('/presupuestos', datos)
      avisos.exito(`Presupuesto de ${p.giro} guardado: ${quetzales(p.monto)}`)
      onListo()
    } catch (error) {
      avisos.error(error)
    }
  }
  return (
    <Modal abierto titulo="Asignar presupuesto mensual" onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <Campo etiqueta="Giro">
          <select name="giro_id" required defaultValue={periodo.giro_id}>
            <option value="" disabled>Seleccione</option>
            {giros.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </Campo>
        <div className="rejilla-campos">
          <Campo etiqueta="Mes">
            <select name="mes" defaultValue={periodo.mes}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </Campo>
          <Campo etiqueta="Año"><input name="anio" type="number" min="2020" max="2100" required defaultValue={periodo.anio} /></Campo>
          <Campo etiqueta="Categoría" ayuda="«general» cubre todos los gastos del giro"><input name="categoria" maxLength={60} defaultValue="general" /></Campo>
          <Campo etiqueta="Monto (Q)"><input name="monto" type="number" min="1" step="0.01" required /></Campo>
        </div>
        <p className="ayuda">Si ya existe un presupuesto para ese giro, mes y categoría, se reemplaza.</p>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
