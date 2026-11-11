import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Barra, Campo, Contenido, Encabezado, Estado, Indicador } from '../../componentes/comunes.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { enviar } from '../../lib/api.js'
import { etiqueta, fecha, hoy, numero, quetzales } from '../../lib/formato.js'
import { esCliente, esGestion } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'
import { FormularioProyecto, SITUACION } from './Proyectos.jsx'

const SIGUIENTES = {
  cotizacion: ['en_ejecucion', 'cancelado'],
  en_ejecucion: ['suspendido', 'finalizado', 'cancelado'],
  suspendido: ['en_ejecucion', 'cancelado'],
  finalizado: [],
  cancelado: []
}
const BOTONES = { en_ejecucion: 'Iniciar ejecución', suspendido: 'Suspender', finalizado: 'Finalizar y entregar', cancelado: 'Cancelar proyecto' }

export default function Proyecto() {
  const { id } = useParams()
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const consulta = useDatos(`/proyectos/${id}`)
  const p = consulta.datos
  const [avance, setAvance] = useState(false)
  const [editar, setEditar] = useState(false)
  const cliente = esCliente(usuario)

  const cambiarEstado = async (estado) => {
    if (['cancelado', 'finalizado'].includes(estado) && !window.confirm(`¿${BOTONES[estado]} ${p.codigo}?`)) return
    try {
      await enviar(`/proyectos/${id}`, { estado }, 'PUT')
      avisos.exito(`Proyecto ${etiqueta(estado).toLowerCase()}; se avisó al cliente`)
      consulta.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Contenido consulta={consulta}>
      {p && (
        <>
          <Encabezado titulo={p.nombre} descripcion={`${p.codigo} · ${etiqueta(p.tipo)} · ${p.ubicacion}`}>
            <Estado valor={p.estado} />
          </Encabezado>
          <p className="miga"><Link to="/portal/proyectos">← Proyectos</Link></p>
          <div className="indicadores">
            <Indicador titulo="Avance registrado" valor={`${numero(p.avance_porcentaje)} %`} />
            <Indicador titulo="Avance esperado" valor={p.avance_esperado != null ? `${numero(p.avance_esperado)} %` : '—'} detalle={p.situacion && p.avance_esperado != null ? etiqueta(p.situacion) : undefined}
              tono={p.situacion === 'atrasado' ? 'negativo' : undefined} />
            <Indicador titulo="Monto del contrato" valor={quetzales(p.monto_contrato)} />
            <Indicador titulo="Plazo" valor={p.dias_restantes != null ? `${numero(p.dias_restantes)} días` : '—'} detalle={`${fecha(p.fecha_inicio)} al ${fecha(p.fecha_fin_estimada)}`}
              tono={p.dias_restantes < 0 ? 'negativo' : undefined} />
          </div>
          <div className="rejilla-panel rejilla-principal">
            <section className="tarjeta-panel">
              <div className="fila-entre">
                <h2>Avances de obra</h2>
                {!cliente && p.estado === 'en_ejecucion' && <button type="button" className="boton" onClick={() => setAvance(true)}>Registrar avance</button>}
              </div>
              <Barra valor={p.avance_porcentaje} esperado={p.avance_esperado} alerta={p.situacion === 'atrasado'} />
              {p.avance_esperado != null && (
                <p className="ayuda">
                  La marca vertical indica el avance esperado según el plazo. <Estado valor={SITUACION[p.situacion]} texto={etiqueta(p.situacion)} />
                </p>
              )}
              {p.avances.length ? (
                <ol className="linea-tiempo">
                  {[...p.avances].reverse().map((a) => (
                    <li key={a.id}>
                      <strong>{numero(a.porcentaje)} % · {a.descripcion}</strong>
                      <small>{fecha(a.fecha)}{a.registrado_por && ` · ${a.registrado_por}`}</small>
                    </li>
                  ))}
                </ol>
              ) : <p className="vacio">Todavía no hay avances registrados.</p>}
            </section>
            <section className="tarjeta-panel">
              <h2>Datos del proyecto</h2>
              <dl className="datos">
                <dt>Cliente</dt><dd>{p.cliente}</dd>
                <dt>Responsable</dt><dd>{p.responsable ?? '—'}</dd>
                <dt>Inicio</dt><dd>{fecha(p.fecha_inicio)}</dd>
                <dt>Fin estimado</dt><dd>{fecha(p.fecha_fin_estimada)}</dd>
                <dt>Registrado</dt><dd>{fecha(p.creado_en)}</dd>
              </dl>
              {esGestion(usuario) && (
                <div className="acciones-estado">
                  {SIGUIENTES[p.estado].map((e) => (
                    <button key={e} type="button" className={`boton boton-chico${e === 'cancelado' ? ' boton-peligro' : e === 'suspendido' ? ' boton-secundario' : ''}`} onClick={() => cambiarEstado(e)}>{BOTONES[e]}</button>
                  ))}
                  {!['finalizado', 'cancelado'].includes(p.estado) && <button type="button" className="boton boton-secundario boton-chico" onClick={() => setEditar(true)}>Editar datos</button>}
                </div>
              )}
              {cliente && <Link to={`/portal/mensajes?nuevo=1&giro_id=${p.giro_id}&asunto=${encodeURIComponent(`Proyecto ${p.codigo}`)}`}>Escribir sobre este proyecto</Link>}
            </section>
          </div>
          {avance && <RegistrarAvance proyecto={p} onCerrar={() => setAvance(false)} onListo={() => { setAvance(false); consulta.recargar() }} />}
          {editar && <FormularioProyecto proyecto={p} onCerrar={() => setEditar(false)} onGuardado={() => { setEditar(false); consulta.recargar() }} />}
        </>
      )}
    </Contenido>
  )
}

function RegistrarAvance({ proyecto, onCerrar, onListo }) {
  const avisos = useAvisos()
  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    try {
      await enviar(`/proyectos/${proyecto.id}/avances`, { ...datos, porcentaje: Number(datos.porcentaje) })
      avisos.exito('Avance registrado; el cliente recibió la notificación')
      onListo()
    } catch (error) {
      avisos.error(error)
    }
  }
  return (
    <Modal abierto titulo={`Registrar avance: ${proyecto.codigo}`} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <Campo etiqueta="Avance acumulado (%)" ayuda={`Actual: ${numero(proyecto.avance_porcentaje)} %. El avance es acumulado y no puede bajar.`}>
          <input name="porcentaje" type="number" min={proyecto.avance_porcentaje} max="100" step="0.5" required defaultValue={proyecto.avance_porcentaje} />
        </Campo>
        <Campo etiqueta="Descripción del avance"><textarea name="descripcion" required rows={3} maxLength={500} placeholder="Trabajo terminado en el periodo" /></Campo>
        <Campo etiqueta="Fecha"><input name="fecha" type="date" max={hoy()} defaultValue={hoy()} /></Campo>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Registrar</button>
        </div>
      </form>
    </Modal>
  )
}
