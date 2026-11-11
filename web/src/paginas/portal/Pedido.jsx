import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Campo, Contenido, Encabezado, Estado } from '../../componentes/comunes.jsx'
import { Modal, ModalComentario } from '../../componentes/Modal.jsx'
import { unidad } from '../../componentes/Productos.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { enviar } from '../../lib/api.js'
import { etiqueta, fecha, fechaHora, numero, quetzales } from '../../lib/formato.js'
import { esCliente, esGestion, puedeListarPersonal } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

const SIGUIENTES = {
  pendiente: ['confirmado', 'cancelado'],
  confirmado: ['en_proceso', 'cancelado'],
  en_proceso: ['despachado', 'cancelado'],
  despachado: ['entregado'],
  entregado: [],
  cancelado: []
}
const BOTONES = { confirmado: 'Confirmar', en_proceso: 'Pasar a en proceso', despachado: 'Despachar', entregado: 'Marcar entregado', cancelado: 'Cancelar pedido' }

export default function Pedido() {
  const { id } = useParams()
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const consulta = useDatos(`/pedidos/${id}`)
  const pedido = consulta.datos
  const cliente = esCliente(usuario)
  const [accion, setAccion] = useState(null)
  const sedes = useDatos(accion === 'despachado' && pedido ? `/sedes?giro_id=${pedido.giro_id}` : null)
  const vendedores = useDatos(pedido && !cliente && esGestion(usuario) && puedeListarPersonal(usuario) ? `/usuarios?rol=vendedor&giro_id=${pedido.giro_id}` : null)
  const viajes = useDatos(pedido && !cliente ? `/viajes?pedido_id=${pedido.id}` : null)

  const cambiarEstado = async (estado, extra = {}) => {
    try {
      await enviar(`/pedidos/${id}/estado`, { estado, ...extra }, 'PATCH')
      avisos.exito(`Pedido ${etiqueta(estado).toLowerCase()}`)
      setAccion(null)
      consulta.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  const asignar = async (e) => {
    try {
      await enviar(`/pedidos/${id}/vendedor`, { vendedor_id: Number(e.target.value) }, 'PATCH')
      avisos.exito('Vendedor asignado; se avisó al vendedor y al cliente')
      consulta.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  const opciones = pedido ? SIGUIENTES[pedido.estado].filter((e) => !cliente || (pedido.estado === 'pendiente' && e === 'cancelado')) : []

  return (
    <Contenido consulta={consulta}>
      {pedido && (
        <>
          <Encabezado titulo={`Pedido ${pedido.codigo}`} descripcion={`${pedido.cliente} · ${pedido.giro}`}>
            <Estado valor={pedido.estado} />
          </Encabezado>
          <p className="miga"><Link to="/portal/pedidos">← Pedidos</Link></p>

          <div className="rejilla-panel rejilla-principal">
            <section className="tarjeta-panel">
              <h2>Productos</h2>
              <div className="tabla">
                <table>
                  <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {pedido.detalle.map((d) => (
                      <tr key={d.producto_id}>
                        <td>{d.producto}<br /><small>{d.codigo}</small></td>
                        <td className="numero">{numero(d.cantidad)} {unidad(d.unidad_medida, d.cantidad)}</td>
                        <td className="numero">{quetzales(d.precio_unitario)}</td>
                        <td className="numero">{quetzales(d.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><th colSpan={3}>Total</th><th className="numero">{quetzales(pedido.total)}</th></tr></tfoot>
                </table>
              </div>

              {opciones.length > 0 && (
                <div className="acciones-estado">
                  {opciones.map((e) => (
                    <button key={e} type="button" className={`boton${e === 'cancelado' ? ' boton-peligro' : ''}`}
                      onClick={() => (['cancelado', 'despachado', 'entregado'].includes(e) ? setAccion(e) : cambiarEstado(e))}>
                      {BOTONES[e]}
                    </button>
                  ))}
                </div>
              )}
              {pedido.estado === 'en_proceso' && !cliente && <p className="ayuda">Al despachar se descuentan los productos del inventario de la sede.</p>}
            </section>

            <div className="columna-lateral">
              <section className="tarjeta-panel">
                <h2>Datos del pedido</h2>
                <dl className="datos">
                  <dt>Creado</dt><dd>{fechaHora(pedido.creado_en)}</dd>
                  <dt>Entrega deseada</dt><dd>{fecha(pedido.fecha_entrega)}</dd>
                  <dt>Dirección</dt><dd>{pedido.direccion_entrega ?? '—'}</dd>
                  <dt>Sede</dt><dd>{pedido.sede ?? 'Por asignar'}</dd>
                  <dt>Vendedor</dt>
                  <dd>
                    {vendedores.datos && !['entregado', 'cancelado'].includes(pedido.estado) ? (
                      <select value={pedido.vendedor_id ?? ''} onChange={asignar} aria-label="Asignar vendedor">
                        <option value="" disabled>Asignar vendedor</option>
                        {vendedores.datos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                      </select>
                    ) : pedido.vendedor ?? 'Por asignar'}
                  </dd>
                  {pedido.observaciones && <><dt>Observaciones</dt><dd>{pedido.observaciones}</dd></>}
                </dl>
                {cliente && <Link to={`/portal/mensajes?nuevo=1&giro_id=${pedido.giro_id}&asunto=${encodeURIComponent(`Pedido ${pedido.codigo}`)}`}>Escribir sobre este pedido</Link>}
              </section>

              <section className="tarjeta-panel">
                <h2>Historial</h2>
                <ol className="linea-tiempo">
                  {pedido.historial.map((h, i) => (
                    <li key={i}>
                      <strong>{h.estado_anterior && h.estado_anterior !== h.estado_nuevo ? `${etiqueta(h.estado_anterior)} → ` : ''}{etiqueta(h.estado_nuevo)}</strong>
                      <small>{fechaHora(h.creado_en)}{h.usuario ? ` · ${h.usuario}` : ''}</small>
                      {h.comentario && <span>{h.comentario}</span>}
                    </li>
                  ))}
                </ol>
              </section>

              {viajes.datos?.length > 0 && (
                <section className="tarjeta-panel">
                  <h2>Viajes</h2>
                  <ul className="lista-filas">
                    {viajes.datos.map((v) => <li key={v.id}><Link to={`/portal/viajes/${v.id}`}>{v.codigo}</Link><Estado valor={v.estado} /></li>)}
                  </ul>
                </section>
              )}
            </div>
          </div>

          <ModalComentario abierto={accion === 'cancelado'} titulo="Cancelar pedido" etiqueta="Motivo de la cancelación" requerido peligro textoBoton="Cancelar pedido"
            onCerrar={() => setAccion(null)} onConfirmar={(comentario) => cambiarEstado('cancelado', { comentario })} />
          <ModalComentario abierto={accion === 'entregado'} titulo="Marcar como entregado" etiqueta="Quién recibió u observaciones" textoBoton="Marcar entregado"
            onCerrar={() => setAccion(null)} onConfirmar={(comentario) => cambiarEstado('entregado', comentario ? { comentario } : {})} />
          <ModalDespacho abierto={accion === 'despachado'} pedido={pedido} sedes={sedes.datos ?? []} onCerrar={() => setAccion(null)} onConfirmar={(extra) => cambiarEstado('despachado', extra)} />
        </>
      )}
    </Contenido>
  )
}

// Al despachar se elige la sede de la que sale la mercadería (se descuenta de su inventario)
function ModalDespacho({ abierto, pedido, sedes, onCerrar, onConfirmar }) {
  const enviarFormulario = (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    onConfirmar({ ...datos, sede_id: Number(datos.sede_id) })
  }
  return (
    <Modal abierto={abierto} titulo={`Despachar ${pedido.codigo}`} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={enviarFormulario}>
        <Campo etiqueta="Sede que despacha">
          <select name="sede_id" required defaultValue={pedido.sede_id ?? ''}>
            <option value="" disabled>Seleccione la sede</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Comentario (opcional)"><textarea name="comentario" rows={2} maxLength={255} placeholder="Placa, piloto o guía de envío" /></Campo>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Volver</button>
          <button type="submit" className="boton">Despachar</button>
        </div>
      </form>
    </Modal>
  )
}
