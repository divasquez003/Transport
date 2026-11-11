import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Contenido, Estado } from '../../componentes/comunes.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar } from '../../lib/api.js'
import { fecha, hoy, quetzales, sumarDias } from '../../lib/formato.js'
import { esCliente } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

// Alquiler de maquinaria: el cliente elige las fechas, ve qué máquinas están libres y reserva
export default function Maquinaria() {
  const [parametros, setParametros] = useSearchParams()
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const navegar = useNavigate()
  const ubicacion = useLocation()
  const inicio = parametros.get('fecha_inicio') ?? sumarDias(hoy(), 1)
  const fin = parametros.get('fecha_fin') ?? sumarDias(hoy(), 3)
  const productoId = parametros.get('producto_id') ?? ''
  const maquinas = useDatos(`/maquinas${consulta({ fecha_inicio: inicio, fecha_fin: fin, producto_id: productoId })}`)
  const [reservando, setReservando] = useState(null)

  const cambiarFechas = (e) => {
    e.preventDefault()
    const datos = Object.fromEntries(new FormData(e.currentTarget))
    setParametros(Object.fromEntries(Object.entries({ ...datos, producto_id: productoId }).filter(([, v]) => v)))
  }

  const reservar = async (maquina) => {
    if (!usuario) return navegar(`/ingresar?volver=${encodeURIComponent(ubicacion.pathname + ubicacion.search)}`)
    if (!esCliente(usuario)) return avisos.error('El personal registra reservas desde el portal, en Maquinaria')
    setReservando(maquina.id)
    try {
      const alquiler = await enviar('/alquileres', { maquina_id: maquina.id, fecha_inicio: inicio, fecha_fin: fin })
      avisos.exito(`Reserva ${alquiler.codigo} registrada por ${quetzales(alquiler.total)}`)
      navegar('/portal/alquileres')
    } catch (error) {
      avisos.error(error)
      maquinas.recargar()
    } finally {
      setReservando(null)
    }
  }

  return (
    <main className="contenedor">
      <h1>Alquiler de maquinaria</h1>
      <p>Indique las fechas de su obra para ver las máquinas libres y el costo total. La reserva se confirma al entregar la máquina en la sucursal.</p>
      <form className="filtros" onSubmit={cambiarFechas}>
        <label className="campo-linea">Desde <input name="fecha_inicio" type="date" defaultValue={inicio} min={hoy()} required /></label>
        <label className="campo-linea">Hasta <input name="fecha_fin" type="date" defaultValue={fin} min={hoy()} required /></label>
        <button className="boton boton-azul" type="submit">Consultar disponibilidad</button>
        {productoId && <Link to="/maquinaria">Ver todas las máquinas</Link>}
      </form>
      <Contenido consulta={maquinas} vacio="No hay máquinas para mostrar.">
        <div className="tarjetas">
          {maquinas.datos?.map((m) => (
            <article key={m.id} className={`tarjeta maquina${m.disponible_en_fechas ? '' : ' no-disponible'}`}>
              <div className="fila-entre">
                <span className="etiqueta">{m.sede}</span>
                {m.disponible_en_fechas ? <Estado valor="disponible" texto="Libre en esas fechas" /> : <Estado valor="cancelado" texto="Ocupada" />}
              </div>
              <h3>{m.tipo} {m.marca}</h3>
              <p>{m.modelo} {m.anio && `· ${m.anio}`} · {m.codigo}</p>
              <p className="precio">{quetzales(m.tarifa_diaria)} <small>por día</small></p>
              {m.disponible_en_fechas && <p>Del {fecha(inicio)} al {fecha(fin)}: <strong>{quetzales(m.total_estimado)}</strong></p>}
              {!m.disponible_en_fechas && m.estado === 'mantenimiento' && <p>En mantenimiento.</p>}
              {m.precio_venta && <p>También a la venta: {quetzales(m.precio_venta)}</p>}
              <button type="button" className="boton" disabled={!m.disponible_en_fechas || reservando === m.id} onClick={() => reservar(m)}>
                {reservando === m.id ? 'Reservando...' : 'Reservar'}
              </button>
            </article>
          ))}
        </div>
      </Contenido>
      <p className="ayuda">Tarifas por día calendario. Si la máquina se devuelve después de la fecha acordada, se cobran los días adicionales a la misma tarifa.</p>
    </main>
  )
}
