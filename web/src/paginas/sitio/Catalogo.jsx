import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Contenido, Paginacion } from '../../componentes/comunes.jsx'
import { ModalCotizar, ProductoTarjeta } from '../../componentes/Productos.jsx'
import { consulta } from '../../lib/api.js'
import { useDatos } from '../../lib/useDatos.js'

// Catálogo público con filtros por giro, tipo y búsqueda (los filtros quedan en la URL)
export default function Catalogo() {
  const [parametros, setParametros] = useSearchParams()
  const filtros = Object.fromEntries(parametros)
  const giros = useDatos('/giros')
  const productos = useDatos(`/productos${consulta({ ...filtros, por_pagina: 12 })}`)
  const [cotizar, setCotizar] = useState(null)

  const cambiar = (campo, valor) => {
    const nuevos = { ...filtros, [campo]: valor }
    if (campo !== 'pagina') delete nuevos.pagina
    setParametros(Object.fromEntries(Object.entries(nuevos).filter(([, v]) => v)))
  }

  const buscar = (e) => {
    e.preventDefault()
    cambiar('buscar', new FormData(e.currentTarget).get('buscar').trim())
  }

  return (
    <main className="contenedor">
      <h1>Catálogo de productos y servicios</h1>
      <div className="filtros">
        <select value={filtros.giro_id ?? ''} onChange={(e) => cambiar('giro_id', e.target.value)} aria-label="Giro de negocio">
          <option value="">Todos los giros</option>
          {giros.datos?.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
        <select value={filtros.tipo ?? ''} onChange={(e) => cambiar('tipo', e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          <option value="producto">Productos</option>
          <option value="materia_prima">Materia prima</option>
          <option value="servicio">Servicios</option>
          <option value="alquiler">Alquiler de maquinaria</option>
        </select>
        <select value={filtros.modalidad ?? ''} onChange={(e) => cambiar('modalidad', e.target.value)} aria-label="Modalidad de venta">
          <option value="">En línea y por cotización</option>
          <option value="en_linea">Pedido en línea</option>
          <option value="cotizacion">Por cotización</option>
        </select>
        <form className="buscador" onSubmit={buscar}>
          <input key={filtros.buscar ?? ''} name="buscar" type="search" defaultValue={filtros.buscar ?? ''} placeholder="Buscar producto o servicio" aria-label="Buscar" />
          <button className="boton boton-azul" type="submit">Buscar</button>
        </form>
      </div>
      <Contenido consulta={productos} vacio="No hay productos con esos filtros.">
        <div className="tarjetas">
          {productos.datos?.map((p) => <ProductoTarjeta key={p.id} producto={p} onCotizar={setCotizar} />)}
        </div>
      </Contenido>
      <Paginacion paginacion={productos.respuesta?.paginacion} onCambiar={(p) => cambiar('pagina', String(p))} />
      <ModalCotizar producto={cotizar} onCerrar={() => setCotizar(null)} />
    </main>
  )
}
