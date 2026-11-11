import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Campo, Contenido, Encabezado, Estado } from '../../componentes/comunes.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { enviar } from '../../lib/api.js'
import { haceCuanto } from '../../lib/formato.js'
import { esCentral, esCliente, tiene, VENTAS } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

// Mensajería cliente - empresa: bandeja a la izquierda y la conversación a la derecha
export default function Mensajes() {
  const { id } = useParams()
  const [parametros, setParametros] = useSearchParams()
  const { usuario } = useSesion()
  const navegar = useNavigate()
  const bandeja = useDatos('/conversaciones?por_pagina=50', { intervalo: 30000 })
  const nueva = parametros.get('nuevo') === '1'
  const puedeIniciar = esCliente(usuario) || tiene(usuario, VENTAS)

  return (
    <>
      <Encabezado titulo="Mensajes" descripcion={esCliente(usuario) ? 'Escriba a cualquier giro de negocio; le responde el personal de ventas.' : 'Conversaciones con clientes de su giro.'}>
        {puedeIniciar && <button type="button" className="boton" onClick={() => setParametros({ nuevo: '1' })}>Nueva conversación</button>}
      </Encabezado>
      <div className={`mensajeria${id ? ' con-conversacion' : ''}`}>
        <aside className="bandeja">
          <Contenido consulta={bandeja} vacio="No hay conversaciones.">
            <ul>
              {bandeja.datos?.map((c) => (
                <li key={c.id}>
                  <Link to={`/portal/mensajes/${c.id}`} className={String(c.id) === id ? 'activa' : ''}>
                    <span className="fila-entre">
                      <strong>{c.asunto}</strong>
                      {c.no_leidos > 0 && <span className="contador">{c.no_leidos}</span>}
                    </span>
                    <small>{esCliente(usuario) ? c.giro ?? 'Sede central' : `${c.cliente}${c.giro ? ` · ${c.giro}` : ''}`}</small>
                    <span className="vista-previa">{c.ultimo_mensaje}</span>
                    <small>{haceCuanto(c.ultimo_mensaje_en)}{c.estado === 'cerrada' && ' · cerrada'}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </Contenido>
        </aside>
        <section className="conversacion">
          {id ? <Conversacion id={id} onCambio={bandeja.recargar} onVolver={() => navegar('/portal/mensajes')} /> : <p className="vacio">Seleccione una conversación.</p>}
        </section>
      </div>
      {nueva && (
        <NuevaConversacion
          inicial={Object.fromEntries(parametros)}
          onCerrar={() => setParametros({})}
          onCreada={(c) => { bandeja.recargar(); navegar(`/portal/mensajes/${c.id}`) }}
        />
      )}
    </>
  )
}

function Conversacion({ id, onCambio, onVolver }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const consulta = useDatos(`/conversaciones/${id}/mensajes`, { intervalo: 15000 })
  const [texto, setTexto] = useState('')
  const final = useRef(null)
  const c = consulta.datos
  const cliente = esCliente(usuario)

  // Al abrir, los mensajes quedan leídos: se actualiza el contador de la bandeja
  useEffect(() => {
    if (c) onCambio()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id])

  useEffect(() => {
    final.current?.scrollIntoView({ block: 'end' })
  }, [c?.mensajes?.length])

  const responder = async (cerrar = false) => {
    if (!texto.trim()) return
    try {
      await enviar(`/conversaciones/${id}/mensajes`, { contenido: texto.trim(), ...(cerrar && { cerrar: true }) })
      setTexto('')
      consulta.recargar()
      onCambio()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Contenido consulta={consulta}>
      {c && (
        <>
          <div className="encabezado-conversacion">
            <button type="button" className="boton-texto volver-bandeja" onClick={onVolver}>← Bandeja</button>
            <div>
              <h2>{c.asunto}</h2>
              <small>{cliente ? c.giro ?? 'Sede central' : `${c.cliente}${c.giro ? ` · ${c.giro}` : ''}`}</small>
            </div>
            <Estado valor={c.estado === 'abierta' ? 'confirmada' : 'cancelada'} texto={c.estado === 'abierta' ? 'Abierta' : 'Cerrada'} />
          </div>
          <ol className="burbujas">
            {c.mensajes.map((m) => (
              <li key={m.id} className={m.usuario_id === usuario.id ? 'propio' : m.es_cliente ? 'cliente' : 'empresa'}>
                <span className="autor">{m.usuario_id === usuario.id ? 'Usted' : m.autor}</span>
                <p>{m.contenido}</p>
                <small>{haceCuanto(m.creado_en)}</small>
              </li>
            ))}
            <li ref={final} className="ancla" aria-hidden="true" />
          </ol>
          <form className="responder" onSubmit={(e) => { e.preventDefault(); responder() }}>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} placeholder="Escriba su mensaje"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder() } }} aria-label="Mensaje" />
            <div className="acciones">
              {!cliente && <button type="button" className="boton boton-secundario" onClick={() => responder(true)} disabled={!texto.trim()}>Responder y cerrar</button>}
              <button type="submit" className="boton" disabled={!texto.trim()}>Enviar</button>
            </div>
          </form>
        </>
      )}
    </Contenido>
  )
}

function NuevaConversacion({ inicial, onCerrar, onCreada }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const cliente = esCliente(usuario)
  const giros = useDatos(cliente || esCentral(usuario) ? '/giros' : null)
  const clientes = useDatos(cliente ? null : '/clientes?activo=1&por_pagina=100')

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    try {
      const conversacion = await enviar('/conversaciones', datos)
      avisos.exito('Mensaje enviado')
      onCreada(conversacion)
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo="Nueva conversación" onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        {!cliente && (
          <Campo etiqueta="Cliente">
            <select name="cliente_id" required defaultValue="">
              <option value="" disabled>Seleccione el cliente</option>
              {clientes.datos?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        )}
        {giros.datos && (
          <Campo etiqueta="Giro de negocio">
            <select name="giro_id" defaultValue={inicial.giro_id ?? ''}>
              <option value="">Consulta general (sede central)</option>
              {giros.datos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo etiqueta="Asunto"><input name="asunto" required maxLength={150} defaultValue={inicial.asunto ?? ''} /></Campo>
        <Campo etiqueta="Mensaje"><textarea name="mensaje" required rows={4} maxLength={2000} /></Campo>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Enviar</button>
        </div>
      </form>
    </Modal>
  )
}
