import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Contenido, Estado } from '../../componentes/comunes.jsx'
import { ModalCotizar, ProductoTarjeta } from '../../componentes/Productos.jsx'
import { etiqueta, quetzales } from '../../lib/formato.js'
import { useDatos } from '../../lib/useDatos.js'

// Página de cada giro en la sala de ventas: sedes, catálogo y maquinaria
export default function Giro() {
  const { id } = useParams()
  const consulta = useDatos(`/giros/${id}`)
  const giro = consulta.datos
  const [cotizar, setCotizar] = useState(null)

  return (
    <Contenido consulta={consulta}>
      {giro && (
        <>
          <section className="portada portada-giro">
            <div className="contenedor">
              <p className="miga"><Link to="/">Inicio</Link> / Giros de negocio</p>
              <h1>{giro.nombre}</h1>
              <p className="slogan">{giro.slogan}</p>
              <p>{giro.descripcion}</p>
            </div>
          </section>
          <main className="contenedor">
            <section>
              <h2>Catálogo</h2>
              <div className="tarjetas">
                {giro.catalogo.map((p) => <ProductoTarjeta key={p.id} producto={{ ...p, giro: giro.nombre }} onCotizar={setCotizar} />)}
              </div>
            </section>

            {giro.maquinas?.length > 0 && (
              <section>
                <div className="encabezado-seccion">
                  <h2>Maquinaria</h2>
                  <Link to="/maquinaria">Consultar disponibilidad y reservar →</Link>
                </div>
                <div className="tabla">
                  <table>
                    <thead><tr><th>Máquina</th><th>Marca y modelo</th><th>Sucursal</th><th>Tarifa diaria</th><th>Venta</th><th>Estado</th></tr></thead>
                    <tbody>
                      {giro.maquinas.map((m) => (
                        <tr key={m.id}>
                          <td><strong>{m.tipo}</strong><br /><small>{m.codigo}</small></td>
                          <td>{m.marca} {m.modelo} {m.anio && `(${m.anio})`}</td>
                          <td>{m.sede}</td>
                          <td>{quetzales(m.tarifa_diaria)}</td>
                          <td>{m.precio_venta ? quetzales(m.precio_venta) : '—'}</td>
                          <td><Estado valor={m.estado} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <h2>Sedes</h2>
              <div className="tarjetas">
                {giro.sedes.map((s) => (
                  <div key={s.id} className="tarjeta">
                    <h3>{s.nombre}</h3>
                    <span className="etiqueta">{etiqueta(s.tipo)}</span>
                    <p>{[s.direccion, s.municipio, s.departamento].filter(Boolean).join(', ')}</p>
                    {s.telefono && <p>Tel. {s.telefono}</p>}
                  </div>
                ))}
              </div>
            </section>
          </main>
          <ModalCotizar producto={cotizar} onCerrar={() => setCotizar(null)} />
        </>
      )}
    </Contenido>
  )
}
