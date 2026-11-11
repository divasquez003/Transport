import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Contenido, Encabezado, Estado } from '../../componentes/comunes.jsx'
import { Mapa } from '../../componentes/Mapa.jsx'
import { ModalComentario } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { enviar } from '../../lib/api.js'
import { fechaHora, haceCuanto, numero, quetzales, TIPOS_RUTA } from '../../lib/formato.js'
import { esCliente, esGestion, puedeVerGiro } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

// Detalle del viaje: mapa con el recorrido del GPS (se actualiza cada 20 s mientras va en ruta)
export default function Viaje() {
  const { id } = useParams()
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const [enRuta, setEnRuta] = useState(false)
  const consulta = useDatos(`/viajes/${id}`, { intervalo: enRuta ? 20000 : 0 })
  const v = consulta.datos
  const [cancelar, setCancelar] = useState(false)
  if (v && enRuta !== (v.estado === 'en_ruta')) setEnRuta(v.estado === 'en_ruta')

  // El giro de transporte opera el viaje; el piloto solo los suyos
  const opera = v && !esCliente(usuario) && puedeVerGiro(usuario, v.giro_id) && (esGestion(usuario) || v.piloto_id === usuario.id)

  const cambiarEstado = async (estado, comentario) => {
    try {
      await enviar(`/viajes/${id}/estado`, { estado, ...(comentario && { comentario }) }, 'PATCH')
      avisos.exito(estado === 'en_ruta' ? 'Viaje iniciado: el cliente ya puede seguirlo' : estado === 'entregado' ? 'Carga entregada' : 'Viaje cancelado')
      setCancelar(false)
      consulta.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Contenido consulta={consulta}>
      {v && (
        <>
          <Encabezado titulo={`Viaje ${v.codigo}`} descripcion={`${v.origen} → ${v.destino}`}>
            <Estado valor={v.estado} />
          </Encabezado>
          <p className="miga"><Link to="/portal/viajes">← Viajes</Link></p>
          <div className="rejilla-panel rejilla-principal">
            <section className="tarjeta-panel">
              <Mapa
                alto={420}
                recorrido={v.recorrido}
                marcadores={v.posicion ? [{
                  id: 'camion',
                  ...v.posicion,
                  color: v.estado === 'en_ruta' ? '#eb6834' : '#2a78d6',
                  texto: `${v.placa} · ${numero(v.posicion.velocidad_kmh ?? 0)} km/h · ${haceCuanto(v.posicion.registrado_en)}`,
                  permanente: true
                }] : []}
              />
              {v.estado === 'en_ruta' && v.posicion && <p className="ayuda">Última posición {haceCuanto(v.posicion.registrado_en)}. El mapa se actualiza solo cada 20 segundos.</p>}
              {v.estado === 'programado' && <p className="ayuda">El recorrido aparece cuando el piloto inicie el viaje.</p>}
              {opera && v.estado !== 'entregado' && v.estado !== 'cancelado' && (
                <div className="acciones-estado">
                  {v.estado === 'programado' && <button type="button" className="boton" onClick={() => cambiarEstado('en_ruta')}>Iniciar viaje</button>}
                  {v.estado === 'en_ruta' && <button type="button" className="boton" onClick={() => cambiarEstado('entregado')}>Marcar carga entregada</button>}
                  {v.estado === 'programado' && <button type="button" className="boton boton-peligro" onClick={() => setCancelar(true)}>Cancelar viaje</button>}
                </div>
              )}
            </section>
            <section className="tarjeta-panel">
              <h2>Datos del viaje</h2>
              <dl className="datos">
                <dt>Tipo de ruta</dt><dd>{TIPOS_RUTA[v.tipo_ruta]}</dd>
                <dt>Transporte</dt><dd>{v.giro}</dd>
                <dt>Vehículo</dt><dd>{v.placa} · {v.tipo_vehiculo}</dd>
                {!esCliente(usuario) && <><dt>Piloto</dt><dd>{v.piloto ? `${v.piloto} (${v.piloto_telefono})` : 'Sin asignar'}</dd></>}
                <dt>Carga</dt><dd>{v.carga_descripcion ?? '—'}{v.peso_ton && ` · ${numero(v.peso_ton)} t`}</dd>
                <dt>Cliente</dt><dd>{v.cliente ?? 'Viaje interno'}</dd>
                {v.pedido && <><dt>Pedido</dt><dd><Link to={`/portal/pedidos/${v.pedido_id}`}>{v.pedido}</Link></dd></>}
                {v.pedido_interno && <><dt>Pedido entre giros</dt><dd>{esCliente(usuario) ? v.pedido_interno : <Link to={`/portal/pedidos-internos?id=${v.pedido_interno_id}`}>{v.pedido_interno}</Link>}</dd></>}
                <dt>Salida programada</dt><dd>{fechaHora(v.salida_programada)}</dd>
                <dt>Salida real</dt><dd>{fechaHora(v.salida_real)}</dd>
                <dt>Llegada</dt><dd>{fechaHora(v.llegada_real)}</dd>
                {v.tarifa != null && !esCliente(usuario) && <><dt>Tarifa</dt><dd>{quetzales(v.tarifa)}</dd></>}
              </dl>
            </section>
          </div>
          <ModalComentario abierto={cancelar} titulo="Cancelar viaje" etiqueta="Motivo" requerido peligro textoBoton="Cancelar viaje"
            onCerrar={() => setCancelar(false)} onConfirmar={(comentario) => cambiarEstado('cancelado', comentario)} />
        </>
      )}
    </Contenido>
  )
}
