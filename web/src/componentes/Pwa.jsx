import { useEffect, useState } from 'react'

// El navegador avisa una sola vez que la PWA se puede instalar: se guarda el evento para cualquier página
let eventoInstalar = null
const oyentes = new Set()
const avisar = (evento) => {
  eventoInstalar = evento
  oyentes.forEach((oyente) => oyente(evento))
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  avisar(e)
})
window.addEventListener('appinstalled', () => avisar(null))

// Botón "Instalar aplicación": aparece cuando el navegador permite instalar la PWA
export function BotonInstalar({ clase = 'boton boton-claro boton-chico' }) {
  const [evento, setEvento] = useState(eventoInstalar)

  useEffect(() => {
    oyentes.add(setEvento)
    return () => oyentes.delete(setEvento)
  }, [])

  if (!evento) return null
  const instalar = async () => {
    evento.prompt()
    await evento.userChoice
    avisar(null)
  }
  return <button type="button" className={clase} onClick={instalar}>Instalar aplicación</button>
}

// Franja que avisa cuando no hay conexión (los datos que se ven son los últimos guardados)
export function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  useEffect(() => {
    const cambiar = () => setEnLinea(navigator.onLine)
    window.addEventListener('online', cambiar)
    window.addEventListener('offline', cambiar)
    return () => {
      window.removeEventListener('online', cambiar)
      window.removeEventListener('offline', cambiar)
    }
  }, [])
  if (enLinea) return null
  return <div className="sin-conexion" role="status">Sin conexión: se muestran los últimos datos guardados en este dispositivo.</div>
}
