import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'

// Carga una ruta de la API y la vuelve a cargar cuando cambia. ruta = null no carga nada.
// Devuelve { datos, respuesta, cargando, error, recargar }
export function useDatos(ruta, { intervalo = 0 } = {}) {
  const [estado, setEstado] = useState({ respuesta: null, cargando: Boolean(ruta), error: null })
  const [version, setVersion] = useState(0)
  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!ruta) {
      setEstado({ respuesta: null, cargando: false, error: null })
      return undefined
    }
    let vigente = true
    setEstado((anterior) => ({ ...anterior, cargando: true, error: null }))
    api(ruta)
      .then((respuesta) => vigente && setEstado({ respuesta, cargando: false, error: null }))
      .catch((error) => vigente && setEstado((anterior) => ({ ...anterior, cargando: false, error })))
    return () => {
      vigente = false
    }
  }, [ruta, version])

  // Actualización periódica (seguimiento de viajes, mensajes)
  useEffect(() => {
    if (!ruta || !intervalo) return undefined
    const temporizador = setInterval(recargar, intervalo)
    return () => clearInterval(temporizador)
  }, [ruta, intervalo, recargar])

  return { datos: estado.respuesta?.data, respuesta: estado.respuesta, cargando: estado.cargando, error: estado.error, recargar }
}
