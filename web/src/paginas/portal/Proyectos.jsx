import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Barra, Campo, Contenido, Encabezado, Estado, Paginacion } from '../../componentes/comunes.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar } from '../../lib/api.js'
import { etiqueta, fecha, hoy, numero, quetzalesCorto } from '../../lib/formato.js'
import { esCentral, esCliente, esGestion, puedeListarPersonal } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

export const SITUACION = { atrasado: 'cancelado', 'a tiempo': 'entregado', adelantado: 'confirmado' }

// Proyectos de construcción con su avance contra el avance esperado según el plazo
export default function Proyectos() {
  const { usuario } = useSesion()
  const navegar = useNavigate()
  const [filtros, setFiltros] = useState({ estado: '', tipo: '', pagina: 1 })
  const lista = useDatos(`/proyectos${consulta(filtros)}`)
  const [nuevo, setNuevo] = useState(false)
  const cliente = esCliente(usuario)

  return (
    <>
      <Encabezado titulo={cliente ? 'Mis proyectos' : 'Proyectos de construcción'} descripcion="Puentes, carreteras y edificios: avance registrado contra el avance esperado según el plazo.">
        {esGestion(usuario) && <button type="button" className="boton" onClick={() => setNuevo(true)}>Nuevo proyecto</button>}
      </Encabezado>
      <div className="filtros">
        <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value, pagina: 1 })} aria-label="Estado">
          <option value="">Todos los estados</option>
          {['cotizacion', 'en_ejecucion', 'suspendido', 'finalizado', 'cancelado'].map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
        </select>
        <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value, pagina: 1 })} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {['puente', 'carretera', 'edificio', 'otro'].map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}
        </select>
      </div>
      <Contenido consulta={lista} vacio="No hay proyectos.">
        <div className="tarjetas tarjetas-lista">
          {lista.datos?.map((p) => (
            <article key={p.id} className="tarjeta tarjeta-clic" onClick={() => navegar(`/portal/proyectos/${p.id}`)}>
              <div className="fila-entre"><strong>{p.codigo}</strong><Estado valor={p.estado} /></div>
              <h3><Link to={`/portal/proyectos/${p.id}`}>{p.nombre}</Link></h3>
              <p>{etiqueta(p.tipo)} · {p.ubicacion}{!cliente && ` · ${p.cliente}`}</p>
              <Barra valor={p.avance_porcentaje} esperado={p.avance_esperado} alerta={p.situacion === 'atrasado'} />
              <p className="fila-entre">
                <span>Avance {numero(p.avance_porcentaje)} %{p.avance_esperado != null && ` · esperado ${numero(p.avance_esperado)} %`}</span>
                {p.avance_esperado != null && <Estado valor={SITUACION[p.situacion]} texto={etiqueta(p.situacion)} />}
              </p>
              <p><small>{quetzalesCorto(p.monto_contrato)} · {fecha(p.fecha_inicio)} al {fecha(p.fecha_fin_estimada)}</small></p>
            </article>
          ))}
        </div>
      </Contenido>
      <Paginacion paginacion={lista.respuesta?.paginacion} onCambiar={(p) => setFiltros({ ...filtros, pagina: p })} />
      {nuevo && <FormularioProyecto proyecto={{}} onCerrar={() => setNuevo(false)} onGuardado={(p) => navegar(`/portal/proyectos/${p.id}`)} />}
    </>
  )
}

export function FormularioProyecto({ proyecto, onCerrar, onGuardado }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const editando = Boolean(proyecto.id)
  const clientes = useDatos(editando ? null : '/clientes?activo=1&por_pagina=100')
  const giros = useDatos(!editando && esCentral(usuario) ? '/giros' : null)
  const giroId = proyecto.giro_id ?? (esCentral(usuario) ? giros.datos?.find((g) => g.codigo === 'CONSTRUCCION')?.id : usuario.giro_id)
  const personal = useDatos(giroId && puedeListarPersonal(usuario) ? `/usuarios?giro_id=${giroId}` : null)

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    for (const campo of ['cliente_id', 'responsable_id', 'monto_contrato']) if (datos[campo]) datos[campo] = Number(datos[campo])
    try {
      const guardado = editando ? await enviar(`/proyectos/${proyecto.id}`, datos, 'PUT') : await enviar('/proyectos', { ...datos, ...(esCentral(usuario) && { giro_id: giroId }) })
      avisos.exito(editando ? 'Proyecto actualizado' : `Proyecto ${guardado.codigo} registrado`)
      onGuardado(guardado)
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo={editando ? `Editar ${proyecto.codigo}` : 'Nuevo proyecto'} onCerrar={onCerrar} ancho>
      <form className="formulario" onSubmit={guardar}>
        <div className="rejilla-campos">
          {!editando && (
            <Campo etiqueta="Cliente">
              <select name="cliente_id" required defaultValue="">
                <option value="" disabled>Seleccione</option>
                {clientes.datos?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Nombre del proyecto"><input name="nombre" required maxLength={150} defaultValue={proyecto.nombre ?? ''} /></Campo>
          <Campo etiqueta="Tipo">
            <select name="tipo" defaultValue={proyecto.tipo ?? 'carretera'}>
              {['puente', 'carretera', 'edificio', 'otro'].map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Ubicación"><input name="ubicacion" required maxLength={200} defaultValue={proyecto.ubicacion ?? ''} /></Campo>
          <Campo etiqueta="Monto del contrato (Q)"><input name="monto_contrato" type="number" min="0" step="0.01" defaultValue={proyecto.monto_contrato ?? ''} /></Campo>
          <Campo etiqueta="Fecha de inicio"><input name="fecha_inicio" type="date" defaultValue={proyecto.fecha_inicio ?? ''} /></Campo>
          <Campo etiqueta="Fin estimado"><input name="fecha_fin_estimada" type="date" min={proyecto.fecha_inicio ?? hoy()} defaultValue={proyecto.fecha_fin_estimada ?? ''} /></Campo>
          {personal.datos && (
            <Campo etiqueta="Responsable">
              <select name="responsable_id" defaultValue={proyecto.responsable_id ?? ''}>
                <option value="">{editando ? 'Sin cambio' : 'Yo'}</option>
                {personal.datos.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.rol_nombre})</option>)}
              </select>
            </Campo>
          )}
        </div>
        {!editando && <p className="ayuda">El proyecto inicia en cotización; al pasar a ejecución el cliente puede seguir los avances.</p>}
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}

