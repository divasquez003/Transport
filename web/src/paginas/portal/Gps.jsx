import { useState } from 'react'
import { Campo, Contenido, Encabezado, Estado } from '../../componentes/comunes.jsx'
import { COLORES } from '../../componentes/Graficas.jsx'
import { Mapa } from '../../componentes/Mapa.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { enviar } from '../../lib/api.js'
import { etiqueta, fechaHora, haceCuanto, numero } from '../../lib/formato.js'
import { delGiro, esCentral, esGestion } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

const COLOR_TIPO = { camion: COLORES.serie1, maquinaria: COLORES.serie2 }
const nombre = (d) => (d.placa ? `Camión ${d.placa}` : `${d.maquina}`)

// Mapa de la flota con el GPS de GPS-Inversiones (se actualiza cada 10 segundos)
export default function Gps() {
  const { usuario } = useSesion()
  const dispositivos = useDatos('/gps/dispositivos', { intervalo: 10000 })
  const [seleccion, setSeleccion] = useState(null)
  const recorrido = useDatos(seleccion ? `/gps/dispositivos/${seleccion}/recorrido` : null)
  const transporte = delGiro(usuario, 'TRANSP_MP', 'TRANSP_PROD')

  const marcadores = (dispositivos.datos ?? []).map((d) => ({
    id: d.id,
    latitud: d.latitud,
    longitud: d.longitud,
    color: COLOR_TIPO[d.tipo],
    texto: `${nombre(d)} · ${numero(d.velocidad_kmh ?? 0)} km/h · ${haceCuanto(d.registrado_en)}`,
    onClick: () => setSeleccion(d.id)
  }))

  return (
    <>
      <Encabezado titulo="Flota y GPS" descripcion="Última posición de camiones y maquinaria. Las alertas de exceso de velocidad y de uso fuera de horario las genera TransPort con estos datos." />
      <Contenido consulta={dispositivos} vacio="No hay dispositivos GPS en su giro.">
        <section className="tarjeta-panel">
          <div className="leyenda">
            <span><i className="clave-caja" style={{ background: COLOR_TIPO.camion }} />Camiones</span>
            <span><i className="clave-caja" style={{ background: COLOR_TIPO.maquinaria }} />Maquinaria</span>
            {seleccion && <button type="button" className="boton-texto" onClick={() => setSeleccion(null)}>Quitar recorrido</button>}
          </div>
          <Mapa alto={440} marcadores={marcadores} recorrido={recorrido.datos?.puntos ?? []} />
          {seleccion && recorrido.datos && <p className="ayuda">Recorrido de las últimas 24 horas: {recorrido.datos.puntos.length} puntos.</p>}
        </section>
        <div className="tabla">
          <table className="tabla-clic">
            <thead><tr><th>Dispositivo</th><th>Asignado a</th><th>Giro</th><th>Velocidad</th><th>Motor</th><th>Horómetro</th><th>Último reporte</th></tr></thead>
            <tbody>
              {dispositivos.datos?.map((d) => {
                const exceso = d.velocidad_maxima_kmh && d.velocidad_kmh > d.velocidad_maxima_kmh
                return (
                  <tr key={d.id} onClick={() => setSeleccion(d.id)} className={seleccion === d.id ? 'fila-seleccionada' : ''}>
                    <td><i className="clave-caja" style={{ background: COLOR_TIPO[d.tipo] }} />{d.codigo_externo}</td>
                    <td>{nombre(d)}{d.estado_maquina && <> <Estado valor={d.estado_maquina} /></>}</td>
                    <td>{d.giro}</td>
                    <td className={exceso ? 'texto-alerta' : ''}>{d.velocidad_kmh != null ? `${numero(d.velocidad_kmh)} km/h` : '—'}{exceso && ` ⚠ (máx. ${d.velocidad_maxima_kmh})`}</td>
                    <td>{d.motor_encendido == null ? '—' : d.motor_encendido ? 'Encendido' : 'Apagado'}</td>
                    <td>{d.horas_uso != null ? `${numero(d.horas_uso)} h` : '—'}</td>
                    <td title={fechaHora(d.registrado_en)}>{d.registrado_en ? haceCuanto(d.registrado_en) : 'Sin reportes'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Contenido>
      {transporte && <Vehiculos />}
    </>
  )
}

function Vehiculos() {
  const { usuario } = useSesion()
  const vehiculos = useDatos('/vehiculos')
  const [editar, setEditar] = useState(null)
  return (
    <section className="tarjeta-panel">
      <div className="fila-entre">
        <h2>Vehículos</h2>
        {esGestion(usuario) && <button type="button" className="boton" onClick={() => setEditar({})}>Registrar vehículo</button>}
      </div>
      <Contenido consulta={vehiculos} vacio="No hay vehículos.">
        <div className="tabla">
          <table>
            <thead><tr><th>Placa</th><th>Tipo</th>{esCentral(usuario) && <th>Giro</th>}<th>Base</th><th>Capacidad</th><th>Velocidad máxima</th><th>GPS</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {vehiculos.datos?.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.placa}</strong></td>
                  <td>{v.tipo}</td>
                  {esCentral(usuario) && <td>{v.giro}</td>}
                  <td>{v.sede ?? '—'}</td>
                  <td>{v.capacidad_ton ? `${numero(v.capacidad_ton)} t` : '—'}</td>
                  <td>{v.velocidad_maxima_kmh} km/h</td>
                  <td>{v.gps ?? '—'}</td>
                  <td><Estado valor={v.estado} /></td>
                  <td>{esGestion(usuario) && <button type="button" className="boton-texto" onClick={() => setEditar(v)}>Editar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      {editar && <FormularioVehiculo vehiculo={editar} onCerrar={() => setEditar(null)} onGuardado={() => { setEditar(null); vehiculos.recargar() }} />}
    </section>
  )
}

function FormularioVehiculo({ vehiculo, onCerrar, onGuardado }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const editando = Boolean(vehiculo.id)
  const giros = useDatos(!editando && esCentral(usuario) ? '/giros' : null)
  const [giroId, setGiroId] = useState(String(vehiculo.giro_id ?? (esCentral(usuario) ? '' : usuario.giro_id)))
  const sedes = useDatos(giroId ? `/sedes?giro_id=${giroId}` : null)

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    for (const campo of ['giro_id', 'sede_id', 'capacidad_ton', 'velocidad_maxima_kmh']) if (datos[campo]) datos[campo] = Number(datos[campo])
    try {
      if (editando) await enviar(`/vehiculos/${vehiculo.id}`, datos, 'PUT')
      else await enviar('/vehiculos', datos)
      avisos.exito(editando ? 'Vehículo actualizado' : 'Vehículo registrado')
      onGuardado()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo={editando ? `Editar ${vehiculo.placa}` : 'Registrar vehículo'} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        {!editando && esCentral(usuario) && (
          <Campo etiqueta="Giro de transporte">
            <select name="giro_id" required value={giroId} onChange={(e) => setGiroId(e.target.value)}>
              <option value="" disabled>Seleccione</option>
              {giros.datos?.filter((g) => g.codigo.startsWith('TRANSP')).map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </Campo>
        )}
        <div className="rejilla-campos">
          <Campo etiqueta="Placa"><input name="placa" required maxLength={15} defaultValue={vehiculo.placa ?? ''} placeholder="C-123ABC" /></Campo>
          <Campo etiqueta="Tipo"><input name="tipo" required maxLength={40} defaultValue={vehiculo.tipo ?? ''} placeholder="Camión de volteo" /></Campo>
          <Campo etiqueta="Base">
            <select name="sede_id" defaultValue={vehiculo.sede_id ?? ''}>
              <option value="">Sin asignar</option>
              {sedes.datos?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Capacidad (t)"><input name="capacidad_ton" type="number" min="0.1" step="0.1" defaultValue={vehiculo.capacidad_ton ?? ''} /></Campo>
          <Campo etiqueta="Velocidad máxima (km/h)"><input name="velocidad_maxima_kmh" type="number" min="20" max="140" defaultValue={vehiculo.velocidad_maxima_kmh ?? 80} /></Campo>
          {vehiculo.estado !== 'en_ruta' && (
            <Campo etiqueta="Estado">
              <select name="estado" defaultValue={vehiculo.estado ?? 'disponible'}>
                {['disponible', 'mantenimiento', 'inactivo'].map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
              </select>
            </Campo>
          )}
        </div>
        <p className="ayuda">La velocidad máxima se usa para las alertas de exceso de velocidad del GPS.</p>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
