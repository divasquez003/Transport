import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const ContextoCarrito = createContext(null)
const CLAVE = 'transport_carrito'

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) ?? []
  } catch {
    return []
  }
}

// Carrito del pedido en línea. Un pedido lleva productos de un solo giro de negocio.
export function ProveedorCarrito({ children }) {
  const [items, setItems] = useState(leer)

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(items))
    } catch {
      // sin almacenamiento: el carrito vive mientras la pestaña esté abierta
    }
  }, [items])

  // Devuelve false si el producto es de otro giro (el usuario decide si vacía el carrito)
  const agregar = useCallback((producto, cantidad, reemplazar = false) => {
    if (!reemplazar && items.length && items[0].producto.giro_id !== producto.giro_id) return false
    setItems((lista) => {
      const base = reemplazar ? [] : lista
      const existe = base.find((i) => i.producto.id === producto.id)
      if (existe) return base.map((i) => (i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + cantidad } : i))
      return [...base, { producto, cantidad }]
    })
    return true
  }, [items])

  const cambiar = useCallback((productoId, cantidad) => {
    setItems((lista) => lista.map((i) => (i.producto.id === productoId ? { ...i, cantidad } : i)))
  }, [])

  const quitar = useCallback((productoId) => setItems((lista) => lista.filter((i) => i.producto.id !== productoId)), [])
  const vaciar = useCallback(() => setItems([]), [])

  const valor = useMemo(() => ({
    items,
    giro: items[0]?.producto.giro ?? null,
    giroId: items[0]?.producto.giro_id ?? null,
    total: items.reduce((s, i) => s + i.producto.precio * i.cantidad, 0),
    agregar,
    cambiar,
    quitar,
    vaciar
  }), [items, agregar, cambiar, quitar, vaciar])

  return <ContextoCarrito.Provider value={valor}>{children}</ContextoCarrito.Provider>
}

export const useCarrito = () => useContext(ContextoCarrito)
