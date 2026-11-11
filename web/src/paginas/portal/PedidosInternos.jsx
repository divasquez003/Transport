import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Campo, Contenido, Encabezado, Estado, Paginacion, Pestanas } from '../../componentes/comunes.jsx'
import { Modal, ModalComentario } from '../../componentes/Modal.jsx'
import { unidad } from '../../componentes/Productos.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar } from '../../lib/api.js'
import { etiqueta, fecha, fechaHora, hoy, numero, quetzales, sumarDias } from '../../lib/formato.js'
import { esCentral, esGestion, puedeVerGiro } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

// estado actual => { siguiente: lado que lo hace }
const FLUJO = {
  solicitado: { aprobado: 'proveedor', rechazado: 'proveedor', cancelado: 'solicitante' },
  aprobado: { en_transito: 'proveedor', cancelado: 'solicitante' },
  en_transito: { recibido: 'solicitante' },
  recibido: {},
  rechazado: {},
  cancelado: {}
}
const BOTONES = { aprobado: 'Aprobar', rechazado: 'Rechazar', cancelado: 'Cancelar', en_transito: 'Despachar (en tránsito)', recibido: 'Confirmar recepción' }

export default function PedidosInternos() {
  const { usuario } = useSesion()
  const [parametros, setParametros] = useSearchParams()
  const filtros = Object.fromEntries(parametros)
  const { id: abiertoId, ...filtrosLista } = filtros
  const lista = useDatos(`/pedidos-internos${consulta(filtrosLista)}`)
  const [nuevo, setNuevo] = useState(false)

  const cambiar = (campo, valor) => {
    const nuevos = { ...filtros, [campo]: valor }
    if (campo !== 'pagina' && campo !== 'id') delete nuevos.pagina
    setParametros(Object.fromEntries(Object.entries(nuevos).filter(([, v]) => v)))
  }

  return (
    <>
      <Encabezado titulo="Pedidos entre giros" descripcion="Abastecimiento interno: una planta pide materia prima a otro giro y el inventario se mueve al despachar y al recibir.">
        {esGestion(usuario) && <button type="button" className="boton" onClick={() => setNuevo(true)}>Nuevo pedido interno</button>}
      </Encabezado>
      {!esCentral(usuario) && (
        <Pestanas
          opciones={[{ id: '', texto: 'Todos' }, { id: 'solicitante', texto: 'Pedidos de mi giro' }, { id: 'proveedor', texto: 'Por atender' }]}
          activa={filtros.rol ?? ''}
          onCambiar={(v) => cambiar('rol', v)}
        />
      )}
      <div className="filtros">
        <select value={filtros.estado ?? ''} onChange={(e) => cambiar('estado', e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.keys(FLUJO).map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
        </select>
        <select value={filtros.prioridad ?? ''} onChange={(e) => cambiar('prioridad', e.target.value)} aria-label="Prioridad">
          <option value="">Todas las prioridades</option>
          {['urgente', 'alta', 'media', 'baja'].map((p) => <option key={p} value={p}>{etiqueta(p)}</option>)}
        </select>
      </div>
      <Contenido consulta={lista} vacio="No hay pedidos entre giros con esos filtros.">
        <div className="tabla">
          <table className="tabla-clic">
            <thead><tr><th>Pedido</th><th>Solicita</th><th>Provee</th><th>Prioridad</th><th>Requerido</th><th>Total</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.datos?.map((p) => (
                <tr key={p.id} onClick={() => cambiar('id', String(p.id))}>
                  <td><strong>{p.codigo}</strong></td>
                  <td>{p.sede_solicitante}<br /><small>{p.giro_solicitante}</small></td>
                  <td>{p.giro_proveedor}{p.sede_proveedora && <><br /><small>{p.sede_proveedora}</small></>}</td>
                  <td><Estado valor={`prioridad-${p.prioridad}`} texto={etiqueta(p.prioridad)} /></td>
                  <td>{fecha(p.fecha_requerida)}</td>
                  <td className="numero">{quetzales(p.total)}</td>
                  <td><Estado valor={p.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Paginacion paginacion={lista.respuesta?.paginacion} onCambiar={(p) => cambiar('pagina', String(p))} />
      {abiertoId && <Detalle id={abiertoId} onCerrar={() => cambiar('id', '')} onCambio={lista.recargar} />}
      {nuevo && <NuevoPedido onCerrar={() => setNuevo(false)} onCreado={(p) => { setNuevo(false); lista.recargar(); cambiar('id', String(p.id)) }} />}
    </>
  )
}

function Detalle({ id, onCerrar, onCambio }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const consultaPedido = useDatos(`/pedidos-internos/${id}`)
  const p = consultaPedido.datos
  const [accion, setAccion] = useState(null)
  const sedesProveedor = useDatos(accion === 'en_transito' && p ? `/sedes?giro_id=${p.giro_proveedor_id}` : null)

  const cambiarEstado = async (estado, extra = {}) => {
    try {
      await enviar(`/pedidos-internos/${id}/estado`, { estado, ...extra }, 'PATCH')
      avisos.exito(`Pedido ${etiqueta(estado).toLowerCase()}`)
      setAccion(null)
      consultaPedido.recargar()
      onCambio()
    } catch (error) {
      avisos.error(error)
    }
  }

  // Solo se muestran las acciones del lado (solicitante o proveedor) al que pertenece el usuario
  const acciones = p && esGestion(usuario)
    ? Object.entries(FLUJO[p.estado]).filter(([, lado]) => puedeVerGiro(usuario, lado === 'proveedor' ? p.giro_proveedor_id : p.giro_solicitante_id)).map(([e]) => e)
    : []

  return (
    <Modal abierto titulo={p ? `Pedido interno ${p.codigo}` : 'Pedido interno'} onCerrar={onCerrar} ancho>
      <Contenido consulta={consultaPedido}>
        {p && (
          <>
            <div className="fila-entre">
              <span><strong>{p.sede_solicitante}</strong> ({p.giro_solicitante}) pide a <strong>{p.giro_proveedor}</strong></span>
              <Estado valor={p.estado} />
            </div>
            <dl className="datos datos-linea">
              <dt>Prioridad</dt><dd>{etiqueta(p.prioridad)}</dd>
              <dt>Requerido para</dt><dd>{fecha(p.fecha_requerida)}</dd>
              <dt>Sede que despacha</dt><dd>{p.sede_proveedora ?? 'Por definir'}</dd>
              <dt>Solicitó</dt><dd>{p.solicitado_por_nombre}</dd>
              {p.atendido_por_nombre && <><dt>Atendió</dt><dd>{p.atendido_por_nombre}</dd></>}
            </dl>
            {p.observaciones && <p className="ayuda">{p.observaciones}</p>}
            <div className="tabla">
              <table>
                <thead><tr><th>Producto</th><th>Cantidad</th><th>Costo</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {p.detalle.map((d) => (
                    <tr key={d.producto_id}>
                      <td>{d.producto}</td>
                      <td className="numero">{numero(d.cantidad)} {unidad(d.unidad_medida, d.cantidad)}</td>
                      <td className="numero">{quetzales(d.costo_unitario)}</td>
                      <td className="numero">{quetzales(d.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><th colSpan={3}>Total</th><th className="numero">{quetzales(p.total)}</th></tr></tfoot>
              </table>
            </div>
            <h3>Historial</h3>
            <ol className="linea-tiempo">
              {p.historial.map((h, i) => (
                <li key={i}>
                  <strong>{etiqueta(h.estado_nuevo)}</strong>
                  <small>{fechaHora(h.creado_en)} · {h.usuario}</small>
                  {h.comentario && <span>{h.comentario}</span>}
                </li>
              ))}
            </ol>
            {acciones.length > 0 && (
              <div className="acciones-estado">
                {acciones.map((e) => (
                  <button key={e} type="button" className={`boton${['rechazado', 'cancelado'].includes(e) ? ' boton-peligro' : ''}`}
                    onClick={() => (e === 'aprobado' || e === 'recibido' ? cambiarEstado(e) : setAccion(e))}>
                    {BOTONES[e]}
                  </button>
                ))}
              </div>
            )}
            {p.estado === 'aprobado' && acciones.includes('en_transito') && <p className="ayuda">Al despachar se descuenta del inventario de la sede proveedora; al recibir, entra al inventario de {p.sede_solicitante}.</p>}

            <ModalComentario abierto={accion === 'rechazado' || accion === 'cancelado'} titulo={accion === 'rechazado' ? 'Rechazar pedido' : 'Cancelar pedido'}
              etiqueta="Motivo" requerido peligro textoBoton={BOTONES[accion] ?? 'Confirmar'}
              onCerrar={() => setAccion(null)} onConfirmar={(comentario) => cambiarEstado(accion, { comentario })} />
            <ModalComentario abierto={accion === 'en_transito'} titulo="Despachar pedido" etiqueta="Comentario" textoBoton="Despachar"
              onCerrar={() => setAccion(null)}
              onConfirmar={(comentario) => {
                const sede = document.getElementById('sede-despacho')?.value
                return cambiarEstado('en_transito', { sede_proveedora_id: Number(sede), ...(comentario && { comentario }) })
              }}>
              <Campo etiqueta="Sede que despacha">
                <select id="sede-despacho" required defaultValue={p.sede_proveedora_id ?? ''}>
                  <option value="" disabled>Seleccione la sede</option>
                  {sedesProveedor.datos?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </Campo>
            </ModalComentario>
          </>
        )}
      </Contenido>
    </Modal>
  )
}

// Formulario: giro proveedor, sede que pide, fecha, prioridad y productos del giro proveedor
function NuevoPedido({ onCerrar, onCreado }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const giros = useDatos('/giros')
  const [proveedor, setProveedor] = useState('')
  const sedesPropias = useDatos(esCentral(usuario) ? '/sedes' : `/sedes?giro_id=${usuario.giro_id}`)
  const productos = useDatos(proveedor ? `/productos?giro_id=${proveedor}&por_pagina=100` : null)
  const [lineas, setLineas] = useState([{ producto_id: '', cantidad: '' }])

  const cambiarLinea = (i, campo, valor) => setLineas((l) => l.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([k, v]) => v !== '' && !k.startsWith('linea')))
    const items = lineas.filter((l) => l.producto_id && l.cantidad).map((l) => ({ producto_id: Number(l.producto_id), cantidad: Number(l.cantidad) }))
    try {
      const pedido = await enviar('/pedidos-internos', { ...datos, items })
      avisos.exito(`Pedido ${pedido.codigo} enviado a ${pedido.giro_proveedor}`)
      onCreado(pedido)
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo="Nuevo pedido interno" onCerrar={onCerrar} ancho>
      <form className="formulario" onSubmit={guardar}>
        <div className="rejilla-campos">
          <Campo etiqueta="Sede que pide">
            <select name="sede_solicitante_id" required defaultValue={usuario.sede_id ?? ''}>
              <option value="" disabled>Seleccione</option>
              {sedesPropias.datos?.filter((s) => s.giro_id).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Giro proveedor">
            <select name="giro_proveedor_id" required value={proveedor} onChange={(e) => { setProveedor(e.target.value); setLineas([{ producto_id: '', cantidad: '' }]) }}>
              <option value="" disabled>Seleccione</option>
              {giros.datos?.filter((g) => g.id !== usuario.giro_id).map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Fecha requerida"><input name="fecha_requerida" type="date" required min={hoy()} defaultValue={sumarDias(hoy(), 3)} /></Campo>
          <Campo etiqueta="Prioridad">
            <select name="prioridad" defaultValue="media">
              {['baja', 'media', 'alta', 'urgente'].map((p) => <option key={p} value={p}>{etiqueta(p)}</option>)}
            </select>
          </Campo>
        </div>
        <fieldset className="lineas">
          <legend>Productos</legend>
          {lineas.map((l, i) => (
            <div key={i} className="linea-producto">
              <select value={l.producto_id} onChange={(e) => cambiarLinea(i, 'producto_id', e.target.value)} disabled={!proveedor} aria-label="Producto">
                <option value="">{proveedor ? 'Seleccione el producto' : 'Primero elija el giro proveedor'}</option>
                {productos.datos?.filter((p) => p.tipo !== 'alquiler').map((p) => <option key={p.id} value={p.id}>{p.nombre} ({quetzales(p.precio)} / {unidad(p.unidad_medida)})</option>)}
              </select>
              <input type="number" min="0.01" step="any" placeholder="Cantidad" value={l.cantidad} onChange={(e) => cambiarLinea(i, 'cantidad', e.target.value)} aria-label="Cantidad" />
              {lineas.length > 1 && <button type="button" className="boton-texto" onClick={() => setLineas((x) => x.filter((_, j) => j !== i))}>Quitar</button>}
            </div>
          ))}
          <button type="button" className="boton-texto" onClick={() => setLineas((x) => [...x, { producto_id: '', cantidad: '' }])}>+ Agregar producto</button>
        </fieldset>
        <Campo etiqueta="Observaciones"><textarea name="observaciones" rows={2} maxLength={500} /></Campo>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Enviar pedido</button>
        </div>
      </form>
    </Modal>
  )
}
