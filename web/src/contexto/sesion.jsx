import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, guardarToken, leerToken } from '../lib/api.js'

const ContextoSesion = createContext(null)
const CLAVE_USUARIO = 'transport_usuario'

function usuarioGuardado() {
  try {
    return leerToken() ? JSON.parse(localStorage.getItem(CLAVE_USUARIO)) : null
  } catch {
    return null
  }
}

function guardarUsuario(usuario) {
  try {
    if (usuario) localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario))
    else localStorage.removeItem(CLAVE_USUARIO)
  } catch {
    // sin almacenamiento disponible
  }
}

export function ProveedorSesion({ children }) {
  const [usuario, setUsuario] = useState(usuarioGuardado)
  const [noLeidas, setNoLeidas] = useState(0)

  const iniciar = useCallback((sesion) => {
    guardarToken(sesion.token)
    guardarUsuario(sesion.usuario)
    setUsuario(sesion.usuario)
    return sesion.usuario
  }, [])

  const salir = useCallback(() => {
    guardarToken(null)
    guardarUsuario(null)
    setUsuario(null)
    setNoLeidas(0)
    // Los datos guardados para usar sin conexión son de este usuario: se borran
    if ('caches' in window) caches.delete('transport-datos').catch(() => {})
  }, [])

  const login = useCallback(async (correo, password) => {
    const respuesta = await api('/auth/login', { metodo: 'POST', cuerpo: { correo, password } })
    return iniciar(respuesta.data)
  }, [iniciar])

  const registrar = useCallback(async (datos) => {
    const respuesta = await api('/auth/registro', { metodo: 'POST', cuerpo: datos })
    return iniciar(respuesta.data)
  }, [iniciar])

  // Vuelve a leer el perfil (rol, giro y alertas sin leer)
  const refrescar = useCallback(async () => {
    if (!leerToken()) return
    try {
      const { data } = await api('/auth/perfil')
      const { alertas_no_leidas: alertas, ...perfil } = data
      guardarUsuario(perfil)
      setUsuario(perfil)
      setNoLeidas(alertas)
    } catch {
      // sin conexión: se mantiene la sesión guardada
    }
  }, [])

  useEffect(() => {
    refrescar()
    const alVencer = () => salir()
    window.addEventListener('sesion-vencida', alVencer)
    // Contador de alertas: se actualiza cada minuto
    const temporizador = setInterval(refrescar, 60000)
    return () => {
      window.removeEventListener('sesion-vencida', alVencer)
      clearInterval(temporizador)
    }
  }, [refrescar, salir])

  const valor = useMemo(
    () => ({ usuario, noLeidas, setNoLeidas, login, registrar, salir, refrescar }),
    [usuario, noLeidas, login, registrar, salir, refrescar]
  )
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}

export const useSesion = () => useContext(ContextoSesion)
