import { useState } from 'react'
import { Campo, Contenido, Encabezado, Estado, Paginacion } from '../../componentes/comunes.jsx'
import { Modal, ModalComentario } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar } from '../../lib/api.js'
import { ahoraLocal, etiqueta, fechaHora } from '../../lib/formato.js'
import { esCentral, esCliente, esGestion, puedeListarPersonal, tiene, VENTAS } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

const minimo = () => ahoraLocal().slice(0, 16).replace(' ', 'T')

export default function Reuniones() {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const [filtros, setFiltros] = useState({ estado: '', mias: '', pagina: 1 })
  const lista = useDatos(`/reuniones${consulta(filtros)}`)
  const [nueva, setNueva] = useState(false)
  const [asignar, setAsignar] = useState(null)
  const [accion, setAccion] = useState(null)
  const cliente = esCliente(usuario)

  const cambiarEstado = async (reunion, estado, notas) => {
    try {
      await enviar(`/reuniones/${reunion.id}/estado`, { estado, ...(notas && { notas }) }, 'PATCH')
      avisos.exito(`Reunión ${estado}`)
      setAccion(null)
      lista.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  // Quién puede marcar la reunión: el vendedor asignado o la gestión del giro; cancelar también el cliente
  const puedeOperar = (r) => cliente || esGestion(usuario) || (usuario.rol === 'vendedor' && r.vendedor_id === usuario.id)

  return (
    <>
      <Encabezado titulo="Reuniones" descripcion={cliente ? 'Reuniones con vendedores para cotizaciones y contratos.' : 'Reuniones con clientes para cerrar tratos.'}>
        {(cliente || tiene(usuario, VENTAS)) && <button type="button" className="boton" onClick={() => setNueva(true)}>{cliente ? 'Solicitar reunión' : 'Agendar reunión'}</button>}
      </Encabezado>
      <div className="filtros">
        <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value, pagina: 1 })} aria-label="Estado">
          <option value="">Todos los estados</option>
          {['solicitada', 'confirmada', 'realizada', 'cancelada'].map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
        </select>
        {usuario.rol === 'vendedor' && (
          <label className="interruptor"><input type="checkbox" checked={Boolean(filtros.mias)} onChange={(e) => setFiltros({ ...filtros, mias: e.target.checked ? '1' : '', pagina: 1 })} /> Solo las mías</label>
        )}
      </div>
      <Contenido consulta={lista} vacio="No hay reuniones.">
        <div className="tarjetas tarjetas-lista">
          {lista.datos?.map((r) => (
            <article key={r.id} className="tarjeta">
              <div className="fila-entre"><strong>{fechaHora(r.fecha_hora)}</strong><Estado valor={r.estado} /></div>
              <h3>{r.asunto}</h3>
              <p>{cliente ? r.giro : `${r.cliente} · ${r.giro}`}{r.producto && ` · ${r.producto}`}</p>
              <p>{r.modalidad === 'presencial' ? `Presencial: ${r.lugar ?? 'por definir'}` : <>Videoconferencia{r.enlace && <>: <a href={r.enlace} target="_blank" rel="noreferrer">{r.enlace}</a></>}</>}</p>
              <p>Vendedor: {r.vendedor ? `${r.vendedor} (${r.vendedor_telefono ?? r.vendedor_correo})` : 'por asignar'}</p>
              {r.notas && <p className="ayuda">{r.notas}</p>}
              <div className="acciones-tarjeta">
                {esGestion(usuario) && puedeListarPersonal(usuario) && ['solicitada', 'confirmada'].includes(r.estado) && (
                  <button type="button" className="boton boton-chico" onClick={() => setAsignar(r)}>{r.vendedor ? 'Reasignar' : 'Asignar vendedor'}</button>
                )}
                {!cliente && r.estado === 'confirmada' && puedeOperar(r) && (
                  <button type="button" className="boton boton-azul boton-chico" onClick={() => setAccion({ reunion: r, estado: 'realizada' })}>Marcar realizada</button>
                )}
                {['solicitada', 'confirmada'].includes(r.estado) && puedeOperar(r) && (
                  <button type="button" className="boton boton-peligro boton-chico" onClick={() => setAccion({ reunion: r, estado: 'cancelada' })}>Cancelar</button>
                )}
              </div>
            </article>
          ))}
        </div>
      </Contenido>
      <Paginacion paginacion={lista.respuesta?.paginacion} onCambiar={(p) => setFiltros({ ...filtros, pagina: p })} />

      {nueva && <NuevaReunion onCerrar={() => setNueva(false)} onCreada={() => { setNueva(false); lista.recargar() }} />}
      {asignar && <AsignarVendedor reunion={asignar} onCerrar={() => setAsignar(null)} onListo={() => { setAsignar(null); lista.recargar() }} />}
      <ModalComentario
        abierto={Boolean(accion)}
        titulo={accion?.estado === 'cancelada' ? 'Cancelar reunión' : 'Reunión realizada'}
        etiqueta={accion?.estado === 'cancelada' ? 'Motivo de la cancelación' : 'Resultado de la reunión'}
        requerido={accion?.estado === 'cancelada'}
        peligro={accion?.estado === 'cancelada'}
        textoBoton={accion?.estado === 'cancelada' ? 'Cancelar reunión' : 'Guardar'}
        onCerrar={() => setAccion(null)}
        onConfirmar={(notas) => cambiarEstado(accion.reunion, accion.estado, notas)}
      />
    </>
  )
}

function NuevaReunion({ onCerrar, onCreada }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const cliente = esCliente(usuario)
  const giros = useDatos('/giros')
  const [giro, setGiro] = useState(cliente || esCentral(usuario) ? '' : String(usuario.giro_id))
  const productos = useDatos(giro ? `/productos?giro_id=${giro}&modalidad=cotizacion&por_pagina=50` : null)
  const clientes = useDatos(cliente ? null : '/clientes?activo=1&por_pagina=100')

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    try {
      const reunion = await enviar('/reuniones', datos)
      avisos.exito(reunion.estado === 'confirmada' ? 'Reunión agendada y confirmada' : 'Reunión solicitada; el gerente asignará un vendedor')
      onCreada()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo={cliente ? 'Solicitar reunión' : 'Agendar reunión con un cliente'} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        {!cliente && (
          <Campo etiqueta="Cliente">
            <select name="cliente_id" required defaultValue="">
              <option value="" disabled>Seleccione el cliente</option>
              {clientes.datos?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo etiqueta="Giro de negocio">
          <select name="giro_id" required value={giro} onChange={(e) => setGiro(e.target.value)} disabled={!cliente && !esCentral(usuario)}>
            <option value="" disabled>Seleccione</option>
            {giros.datos?.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          {!cliente && !esCentral(usuario) && <input type="hidden" name="giro_id" value={giro} />}
        </Campo>
        <Campo etiqueta="Producto o servicio de interés (opcional)">
          <select name="producto_id" defaultValue="">
            <option value="">General</option>
            {productos.datos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Asunto"><input name="asunto" required maxLength={150} /></Campo>
        <Campo etiqueta="Fecha y hora"><input name="fecha_hora" type="datetime-local" required min={minimo()} /></Campo>
        <Campo etiqueta="Modalidad">
          <select name="modalidad" defaultValue="presencial">
            <option value="presencial">Presencial (Edificio Sixtino, zona 10)</option>
            <option value="videoconferencia">Videoconferencia</option>
          </select>
        </Campo>
        <Campo etiqueta="Notas (opcional)"><textarea name="notas" rows={3} maxLength={500} /></Campo>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">{cliente ? 'Solicitar' : 'Agendar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function AsignarVendedor({ reunion, onCerrar, onListo }) {
  const avisos = useAvisos()
  const vendedores = useDatos(`/usuarios?rol=vendedor&giro_id=${reunion.giro_id}`)

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    try {
      await enviar(`/reuniones/${reunion.id}/asignar`, { ...datos, vendedor_id: Number(datos.vendedor_id) }, 'PATCH')
      avisos.exito('Vendedor asignado; se avisó al vendedor y al cliente')
      onListo()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo={`Asignar vendedor: ${reunion.asunto}`} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="ayuda">{reunion.cliente} · {fechaHora(reunion.fecha_hora)} · {etiqueta(reunion.modalidad)}</p>
        <Campo etiqueta="Vendedor">
          <select name="vendedor_id" required defaultValue={reunion.vendedor_id ?? ''}>
            <option value="" disabled>Seleccione</option>
            {vendedores.datos?.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Cambiar fecha y hora (opcional)"><input name="fecha_hora" type="datetime-local" min={minimo()} /></Campo>
        {reunion.modalidad === 'presencial'
          ? <Campo etiqueta="Lugar"><input name="lugar" maxLength={200} defaultValue={reunion.lugar ?? ''} /></Campo>
          : <Campo etiqueta="Enlace de la videoconferencia"><input name="enlace" type="url" maxLength={255} defaultValue={reunion.enlace ?? ''} placeholder="https://..." /></Campo>}
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Confirmar reunión</button>
        </div>
      </form>
    </Modal>
  )
}
