import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ContextoAvisos = createContext(null)

// Mensajes breves de éxito o error en la esquina de la pantalla
export function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([])
  const siguiente = useRef(1)

  const mostrar = useCallback((tipo, texto) => {
    const id = siguiente.current++
    setAvisos((lista) => [...lista.slice(-2), { id, tipo, texto }])
    setTimeout(() => setAvisos((lista) => lista.filter((a) => a.id !== id)), tipo === 'error' ? 7000 : 4000)
  }, [])

  const valor = useMemo(() => ({
    exito: (texto) => mostrar('exito', texto),
    error: (error) => mostrar('error', error?.detalle ?? error?.message ?? String(error))
  }), [mostrar])

  return (
    <ContextoAvisos.Provider value={valor}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`}>{a.texto}</div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  )
}

export const useAvisos = () => useContext(ContextoAvisos)
