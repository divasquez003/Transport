import { useEffect, useState } from 'react'
import { Campo, Contenido, Encabezado, Vacio } from '../../componentes/comunes.jsx'
import { ListaAlertas } from '../../componentes/ListaAlertas.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { api, enviar, obtener } from '../../lib/api.js'
import { ahoraLocal, etiqueta, fechaHora } from '../../lib/formato.js'
import { useDatos } from '../../lib/useDatos.js'

// La llave pública VAPID viene en base64url; el navegador la necesita como bytes
function aBytes(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4)
  const texto = atob((base64 + relleno).replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(texto, (c) => c.charCodeAt(0))
}

// Activa las notificaciones push en este dispositivo (requiere la app compilada: service worker)
function Notificaciones() {
  const avisos = useAvisos()
  const soportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const [estado, setEstado] = useState(soportado ? Notification.permission : 'no-soportado')
  const [suscrito, setSuscrito] = useState(false)

  useEffect(() => {
    if (!soportado) return
    navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setSuscrito(Boolean(s))).catch(() => {})
  }, [soportado])

  const activar = async () => {
    try {
      const clave = await obtener('/notificaciones/clave-publica')
      if (!clave.habilitado) throw new Error('El servidor no tiene configuradas las llaves VAPID')
      const permiso = await Notification.requestPermission()
      setEstado(permiso)
      if (permiso !== 'granted') throw new Error('No se dio permiso para mostrar notificaciones')
      const registro = await navigator.serviceWorker.getRegistration()
      if (!registro) throw new Error('La aplicación todavía no instaló su service worker (use la versión compilada, no npm run dev)')
      const suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave.clave_publica) })
      await enviar('/notificaciones/suscripcion', suscripcion.toJSON())
      setSuscrito(true)
      avisos.exito('Notificaciones activadas en este dispositivo')
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <section className="tarjeta-panel">
      <h2>Notificaciones en este dispositivo</h2>
      {!soportado && <p>Este navegador no permite notificaciones push.</p>}
      {soportado && suscrito && <p className="exito">Activadas: las alertas también llegan como notificación, aunque la aplicación esté cerrada.</p>}
      {soportado && !suscrito && (
        <>
          <p>Reciba las alertas como notificación del sistema (celular o computadora), aunque no tenga abierta la aplicación.</p>
          {estado === 'denied' ? <p className="ayuda">Las notificaciones están bloqueadas para este sitio; habilítelas en la configuración del navegador.</p>
            : <button type="button" className="boton" onClick={activar}>Activar notificaciones</button>}
        </>
      )}
    </section>
  )
}

function Recordatorios() {
  const avisos = useAvisos()
  const consulta = useDatos('/recordatorios')

  const crear = async (e) => {
    e.preventDefault()
    const formulario = e.currentTarget
    const datos = Object.fromEntries([...new FormData(formulario)].filter(([, v]) => v !== ''))
    try {
      await enviar('/recordatorios', datos)
      formulario.reset()
      avisos.exito('Recordatorio programado')
      consulta.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  const eliminar = async (r) => {
    try {
      await api(`/recordatorios/${r.id}`, { metodo: 'DELETE' })
      consulta.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <section className="tarjeta-panel">
      <h2>Mis recordatorios</h2>
      <form className="formulario formulario-linea" onSubmit={crear}>
        <Campo etiqueta="Título"><input name="titulo" required maxLength={150} placeholder="Revisar existencias" /></Campo>
        <Campo etiqueta="Fecha y hora"><input name="fecha_hora" type="datetime-local" required min={ahoraLocal().slice(0, 16).replace(' ', 'T')} /></Campo>
        <Campo etiqueta="Repetir">
          <select name="repeticion" defaultValue="ninguna">
            <option value="ninguna">No repetir</option>
            <option value="diaria">Cada día</option>
            <option value="semanal">Cada semana</option>
            <option value="mensual">Cada mes</option>
          </select>
        </Campo>
        <Campo etiqueta="Detalle (opcional)"><input name="descripcion" maxLength={500} /></Campo>
        <button className="boton" type="submit">Programar</button>
      </form>
      <Contenido consulta={consulta} vacio="No tiene recordatorios.">
        <ul className="lista-filas">
          {consulta.datos?.map((r) => (
            <li key={r.id} className={r.enviado ? 'atenuado' : ''}>
              <span><strong>{fechaHora(r.fecha_hora)}</strong> · {r.titulo}{r.repeticion !== 'ninguna' && ` (${etiqueta(r.repeticion)})`}{r.enviado && ' · enviado'}</span>
              <button type="button" className="boton-texto" onClick={() => eliminar(r)}>Eliminar</button>
            </li>
          ))}
        </ul>
      </Contenido>
    </section>
  )
}

export default function Alertas() {
  const { setNoLeidas } = useSesion()
  const avisos = useAvisos()
  const [soloNuevas, setSoloNuevas] = useState(false)
  const consulta = useDatos(`/alertas?limite=100${soloNuevas ? '&no_leidas=1' : ''}`)

  useEffect(() => {
    if (consulta.respuesta) setNoLeidas(consulta.respuesta.no_leidas)
  }, [consulta.respuesta, setNoLeidas])

  const marcarTodas = async () => {
    try {
      const { data } = await api('/alertas/leidas', { metodo: 'PATCH' })
      avisos.exito(`${data.marcadas} alertas marcadas como leídas`)
      consulta.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <>
      <Encabezado titulo="Alertas" descripcion="Avisos de pedidos, inventario, viajes, GPS, presupuesto y recordatorios según su rol.">
        <label className="interruptor"><input type="checkbox" checked={soloNuevas} onChange={(e) => setSoloNuevas(e.target.checked)} /> Solo sin leer</label>
        <button type="button" className="boton boton-secundario" onClick={marcarTodas}>Marcar todas como leídas</button>
      </Encabezado>
      <div className="rejilla-panel rejilla-principal">
        <section className="tarjeta-panel">
          <Contenido consulta={consulta} vacio={soloNuevas ? 'No tiene alertas sin leer.' : 'No tiene alertas.'}>
            {consulta.datos?.length ? <ListaAlertas alertas={consulta.datos} onCambio={consulta.recargar} /> : <Vacio />}
          </Contenido>
        </section>
        <div className="columna-lateral">
          <Notificaciones />
          <Recordatorios />
        </div>
      </div>
    </>
  )
}
