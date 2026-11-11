import { useState } from 'react'
import { Link } from 'react-router'
import { Contenido } from '../../componentes/comunes.jsx'
import { ModalCotizar, ProductoTarjeta } from '../../componentes/Productos.jsx'
import { useDatos } from '../../lib/useDatos.js'

const FORMAS = [
  { titulo: 'Pedido en línea', texto: 'Materia prima, pisos, block y materiales: agréguelos al carrito y haga su pedido. Le avisamos cada cambio de estado.' },
  { titulo: 'Cotización con un vendedor', texto: 'Edificios, puentes, carreteras y contratos de transporte: agende una reunión y un vendedor del giro lo atiende.' },
  { titulo: 'Alquiler de maquinaria', texto: 'Consulte qué máquinas están libres en sus fechas, vea el costo y resérvelas en línea.' }
]

// Dos productos de cada giro para que la portada muestre de todo un poco
function variados(productos) {
  const porGiro = new Map()
  for (const p of productos.filter((x) => x.tipo !== 'alquiler')) porGiro.set(p.giro_id, [...(porGiro.get(p.giro_id) ?? []), p])
  return [...porGiro.values()].flatMap((lista) => lista.slice(0, 2)).slice(0, 8)
}

export function Inicio() {
  const giros = useDatos('/giros')
  const destacados = useDatos('/productos?modalidad=en_linea&por_pagina=100')
  const [cotizar, setCotizar] = useState(null)

  return (
    <>
      <section className="portada">
        <div className="contenedor">
          <h1>Todo para construir Guatemala, en un solo lugar</h1>
          <p>Materia prima, pisos y materiales de construcción, maquinaria, transporte y obras. Haga sus pedidos en línea, siga sus viajes en el mapa o agende una reunión con un vendedor.</p>
          <Link className="boton" to="/catalogo">Ver catálogo</Link>
          <Link className="boton boton-secundario" to="/ingresar?registro=1">Crear cuenta de cliente</Link>
        </div>
      </section>

      <main className="contenedor">
        <section>
          <h2>Nuestros giros de negocio</h2>
          <Contenido consulta={giros}>
            <div className="tarjetas">
              {giros.datos?.map((g) => (
                <Link key={g.id} className="tarjeta giro" to={`/giros/${g.id}`}>
                  <h3>{g.nombre}</h3>
                  <p className="slogan">{g.slogan}</p>
                  <p>{g.descripcion}</p>
                  <div className="pie">
                    <span className="etiqueta">{g.total_sedes} {g.total_sedes === 1 ? 'sede' : 'sedes'}</span>
                    <span className="etiqueta">{g.total_productos} {g.total_productos === 1 ? 'producto o servicio' : 'productos y servicios'}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Contenido>
        </section>

        <section>
          <h2>Tres formas de hacer negocio con nosotros</h2>
          <div className="tarjetas">
            {FORMAS.map((f, i) => (
              <div key={f.titulo} className="tarjeta forma">
                <span className="numero-paso">{i + 1}</span>
                <h3>{f.titulo}</h3>
                <p>{f.texto}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="encabezado-seccion">
            <h2>Para pedir en línea</h2>
            <Link to="/catalogo">Ver todo el catálogo →</Link>
          </div>
          <Contenido consulta={destacados}>
            <div className="tarjetas">
              {variados(destacados.datos ?? []).map((p) => <ProductoTarjeta key={p.id} producto={p} onCotizar={setCotizar} />)}
            </div>
          </Contenido>
        </section>
      </main>
      <ModalCotizar producto={cotizar} onCerrar={() => setCotizar(null)} />
    </>
  )
}
