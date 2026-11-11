import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Campo, Contenido, Encabezado, Estado, Paginacion } from '../../componentes/comunes.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar } from '../../lib/api.js'
import { ahoraLocal, etiqueta, fechaHora, TIPOS_RUTA } from '../../lib/formato.js'
import { delGiro, esCentral, esCliente, esGestion, puedeListarPersonal } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

// Rutas que atiende cada giro de transporte (las mismas reglas que la API)
const RUTAS_POR_GIRO = { TRANSP_MP: ['materia_prima', 'local'], TRANSP_PROD: ['inter_puertos', 'inter_fronteras', 'puerto_bodega', 'bodega_puerto', 'local'] }

export default function Viajes() {
  const { usuario } = useSesion()
  const navegar = useNavigate()
  const [filtros, setFiltros] = useState({ estado: '', mios: usuario.rol === 'operativo' ? '1' : '', pagina: 1 })
  const lista = useDatos(`/viajes${consulta(filtros)}`)
  const [nuevo, setNuevo] = useState(false)
  const cliente = esCliente(usuario)
  const programa = esGestion(usuario) && delGiro(usuario, 'TRANSP_MP', 'TRANSP_PROD')

  return (
    <>
      <Encabezado titulo={cliente ? 'Seguimiento de viajes' : 'Viajes'} descripcion={cliente ? 'Vea en el mapa dónde va su carga.' : 'Transporte de materia prima y de productos con seguimiento GPS.'}>
        {programa && <button type="button" className="boton" onClick={() => setNuevo(true)}>Programar viaje</button>}
      </Encabezado>
      <div className="filtros">
        <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value, pagina: 1 })} aria-label="Estado">
          <option value="">Todos los estados</option>
          {['programado', 'en_ruta', 'entregado', 'cancelado'].map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
        </select>
        {usuario.rol === 'operativo' && (
          <label className="interruptor"><input type="checkbox" checked={Boolean(filtros.mios)} onChange={(e) => setFiltros({ ...filtros, mios: e.target.checked ? '1' : '', pagina: 1 })} /> Solo mis viajes</label>
        )}
      </div>
      <Contenido consulta={lista} vacio="No hay viajes.">
        <div className="tabla">
          <table className="tabla-clic">
            <thead><tr><th>Viaje</th><th>Ruta</th><th>Tipo</th><th>Vehículo</th>{!cliente && <th>Piloto</th>}<th>Cliente o pedido</th><th>Salida</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.datos?.map((v) => (
                <tr key={v.id} onClick={() => navegar(`/portal/viajes/${v.id}`)}>
                  <td><Link to={`/portal/viajes/${v.id}`}>{v.codigo}</Link></td>
                  <td>{v.origen} → {v.destino}</td>
                  <td>{TIPOS_RUTA[v.tipo_ruta]}</td>
                  <td>{v.placa}</td>
                  {!cliente && <td>{v.piloto ?? '—'}</td>}
                  <td>{v.cliente ?? (v.pedido_interno ? `Pedido interno ${v.pedido_interno}` : 'Interno')}{v.pedido && <><br /><small>{v.pedido}</small></>}</td>
                  <td>{fechaHora(v.salida_real ?? v.salida_programada)}</td>
                  <td><Estado valor={v.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Paginacion paginacion={lista.respuesta?.paginacion} onCambiar={(p) => setFiltros({ ...filtros, pagina: p })} />
      {nuevo && <ProgramarViaje onCerrar={() => setNuevo(false)} onCreado={(v) => navegar(`/portal/viajes/${v.id}`)} />}
    </>
  )
}

function ProgramarViaje({ onCerrar, onCreado }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const vehiculos = useDatos('/vehiculos')
  const [vehiculoId, setVehiculoId] = useState('')
  const vehiculo = vehiculos.datos?.find((v) => String(v.id) === vehiculoId)
  const giros = useDatos('/giros')
  const codigoGiro = giros.datos?.find((g) => g.id === (vehiculo?.giro_id ?? usuario.giro_id))?.codigo
  const rutas = RUTAS_POR_GIRO[codigoGiro] ?? Object.keys(TIPOS_RUTA)
  const pilotos = useDatos(vehiculo && puedeListarPersonal(usuario) ? `/usuarios?rol=operativo&giro_id=${vehiculo.giro_id}` : null)
  const clientes = useDatos('/clientes?activo=1&por_pagina=100')

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    for (const campo of ['vehiculo_id', 'piloto_id', 'cliente_id', 'pedido_id', 'pedido_interno_id', 'peso_ton', 'tarifa']) if (datos[campo]) datos[campo] = Number(datos[campo])
    try {
      const viaje = await enviar('/viajes', datos)
      avisos.exito(`Viaje ${viaje.codigo} programado`)
      onCreado(viaje)
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo="Programar viaje" onCerrar={onCerrar} ancho>
      <form className="formulario" onSubmit={guardar}>
        <div className="rejilla-campos">
          <Campo etiqueta="Vehículo">
            <select name="vehiculo_id" required value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)}>
              <option value="" disabled>Seleccione</option>
              {vehiculos.datos?.filter((v) => ['disponible', 'en_ruta'].includes(v.estado)).map((v) => (
                <option key={v.id} value={v.id}>{v.placa} · {v.tipo}{v.capacidad_ton ? ` · ${v.capacidad_ton} t` : ''}{esCentral(usuario) ? ` · ${v.giro}` : ''}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Piloto">
            <select name="piloto_id" defaultValue="" disabled={!pilotos.datos}>
              <option value="">{pilotos.datos ? 'Sin asignar' : 'Elija el vehículo'}</option>
              {pilotos.datos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Tipo de ruta">
            <select name="tipo_ruta" required defaultValue="">
              <option value="" disabled>Seleccione</option>
              {rutas.map((r) => <option key={r} value={r}>{TIPOS_RUTA[r]}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Salida programada"><input name="salida_programada" type="datetime-local" required min={`${ahoraLocal().slice(0, 10)}T00:00`} /></Campo>
          <Campo etiqueta="Origen"><input name="origen" required maxLength={150} placeholder="Planta, puerto o bodega" /></Campo>
          <Campo etiqueta="Destino"><input name="destino" required maxLength={150} /></Campo>
          <Campo etiqueta="Carga"><input name="carga_descripcion" maxLength={200} placeholder="Piedra caliza, contenedor 40'..." /></Campo>
          <Campo etiqueta="Peso (toneladas)"><input name="peso_ton" type="number" min="0.1" step="0.1" max={vehiculo?.capacidad_ton ?? undefined} /></Campo>
          <Campo etiqueta="Cliente (opcional)">
            <select name="cliente_id" defaultValue="">
              <option value="">Viaje interno</option>
              {clientes.datos?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Tarifa (Q)"><input name="tarifa" type="number" min="0" step="0.01" /></Campo>
          <Campo etiqueta="Pedido de cliente (id, opcional)"><input name="pedido_id" type="number" min="1" /></Campo>
          <Campo etiqueta="Pedido entre giros (id, opcional)"><input name="pedido_interno_id" type="number" min="1" /></Campo>
        </div>
        <p className="ayuda">Al programarlo se avisa al piloto y al cliente. Cuando el viaje esté en ruta, el cliente lo sigue en el mapa con el GPS del camión.</p>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Programar</button>
        </div>
      </form>
    </Modal>
  )
}

