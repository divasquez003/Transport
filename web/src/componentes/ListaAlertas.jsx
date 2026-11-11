import { useNavigate } from 'react-router'
import { useSesion } from '../contexto/sesion.jsx'
import { api } from '../lib/api.js'
import { enlaceEntidad } from '../lib/enlaces.js'
import { haceCuanto } from '../lib/formato.js'

// Lista de alertas: al abrir una se marca como leída y se va a la página relacionada
export function ListaAlertas({ alertas, onCambio }) {
  const navegar = useNavigate()
  const { setNoLeidas } = useSesion()

  const abrir = async (alerta) => {
    if (!alerta.leida) {
      try {
        const { data } = await api(`/alertas/${alerta.id}/leida`, { metodo: 'PATCH' })
        setNoLeidas(data.no_leidas)
        onCambio?.()
      } catch {
        // sin conexión: se abre de todos modos
      }
    }
    const destino = enlaceEntidad(alerta.entidad, alerta.entidad_id)
    if (destino) navegar(destino)
  }

  return (
    <ul className="alertas">
      {alertas.map((a) => (
        <li key={a.id}>
          <button type="button" className={`alerta${a.leida ? '' : ' no-leida'} prioridad-${a.prioridad}`} onClick={() => abrir(a)}>
            <span className="alerta-titulo">
              {a.prioridad === 'alta' && <span className="icono-alta" aria-label="Prioridad alta">!</span>}
              {a.titulo}
            </span>
            <span className="alerta-mensaje">{a.mensaje}</span>
            <small>{haceCuanto(a.creado_en)}{a.leida ? '' : ' · nueva'}</small>
          </button>
        </li>
      ))}
    </ul>
  )
}
