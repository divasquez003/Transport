import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAvisos } from '../contexto/avisos.jsx'
import { useCarrito } from '../contexto/carrito.jsx'
import { useSesion } from '../contexto/sesion.jsx'
import { enviar } from '../lib/api.js'
import { ahoraLocal, etiqueta, numero, quetzales, unidad } from '../lib/formato.js'
import { esCliente } from '../lib/permisos.js'
import { Campo } from './comunes.jsx'
import { Modal } from './Modal.jsx'

export { unidad }

// Tarjeta del catálogo: según el producto se pide en línea, se cotiza en una reunión o se alquila
export function ProductoTarjeta({ producto, onCotizar }) {
  const { agregar, giro } = useCarrito()
  const avisos = useAvisos()
  const [cantidad, setCantidad] = useState(1)
  const enLinea = producto.modalidad_venta === 'en_linea' && producto.tipo !== 'alquiler'

  const alCarrito = () => {
    const valor = Number(cantidad)
    if (!(valor > 0)) return avisos.error('Indique una cantidad mayor que cero')
    if (!agregar(producto, valor)) {
      if (!window.confirm(`Su carrito tiene productos de "${giro}". Cada pedido es de un solo giro de negocio. ¿Vaciar el carrito y agregar este producto?`)) return
      agregar(producto, valor, true)
    }
    avisos.exito(`${producto.nombre} agregado al carrito`)
  }

  return (
    <article className="tarjeta producto">
      <span className="etiqueta">{producto.giro}</span>
      <h3>{producto.nombre}</h3>
      <p>{producto.descripcion}</p>
      <div className="pie">
        <span className="precio">
          {producto.precio > 0 ? <>{quetzales(producto.precio)} <small>/ {unidad(producto.unidad_medida)}</small></> : 'Precio según cotización'}
        </span>
      </div>
      {enLinea && (
        <div className="comprar">
          <input type="number" min="0.01" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} aria-label={`Cantidad de ${producto.nombre}`} />
          <button type="button" className="boton" onClick={alCarrito}>Agregar</button>
        </div>
      )}
      {producto.tipo === 'alquiler' && <Link className="boton boton-azul" to={`/maquinaria?producto_id=${producto.id}`}>Ver máquinas disponibles</Link>}
      {producto.modalidad_venta === 'cotizacion' && producto.tipo !== 'alquiler' && (
        <button type="button" className="boton boton-azul" onClick={() => onCotizar(producto)}>Solicitar cotización</button>
      )}
    </article>
  )
}

// Los productos por cotización se cierran en una reunión con un vendedor del giro
export function ModalCotizar({ producto, onCerrar }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const ubicacion = useLocation()
  const navegar = useNavigate()
  const [enviando, setEnviando] = useState(false)

  const solicitar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries(new FormData(e.currentTarget))
    setEnviando(true)
    try {
      const reunion = await enviar('/reuniones', { ...datos, producto_id: producto.id })
      avisos.exito(`Reunión solicitada para el ${reunion.fecha_hora.slice(0, 16)}. Le avisaremos cuando se asigne un vendedor.`)
      onCerrar()
      navegar('/portal/reuniones')
    } catch (error) {
      avisos.error(error)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal abierto={Boolean(producto)} titulo="Solicitar cotización" onCerrar={onCerrar}>
      {producto && !usuario && (
        <p>
          Para agendar una reunión con un vendedor de <strong>{producto.giro}</strong> inicie sesión o cree su cuenta de cliente.
          <br /><br />
          <Link className="boton" to={`/ingresar?volver=${encodeURIComponent(ubicacion.pathname + ubicacion.search)}`}>Iniciar sesión</Link>
        </p>
      )}
      {producto && usuario && !esCliente(usuario) && (
        <p>Las reuniones para clientes se agendan desde el portal, en <Link to="/portal/reuniones">Reuniones</Link>.</p>
      )}
      {producto && esCliente(usuario) && (
        <form className="formulario" onSubmit={solicitar}>
          <p className="ayuda">Un vendedor de <strong>{producto.giro}</strong> le confirmará la reunión para preparar la cotización de <strong>{producto.nombre}</strong>.</p>
          <Campo etiqueta="Asunto"><input name="asunto" required maxLength={150} defaultValue={`Cotización: ${producto.nombre}`} /></Campo>
          <Campo etiqueta="Fecha y hora propuesta">
            <input name="fecha_hora" type="datetime-local" required min={ahoraLocal().slice(0, 16).replace(' ', 'T')} />
          </Campo>
          <Campo etiqueta="Modalidad">
            <select name="modalidad" defaultValue="presencial">
              <option value="presencial">Presencial (Edificio Sixtino, zona 10)</option>
              <option value="videoconferencia">Videoconferencia</option>
            </select>
          </Campo>
          <Campo etiqueta="Detalles para el vendedor (opcional)"><textarea name="notas" rows={3} maxLength={500} placeholder="Medidas, volumen, ubicación de la obra..." /></Campo>
          <div className="acciones">
            <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Enviando...' : 'Solicitar reunión'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// Fila de existencias por sede (detalle del producto)
export function Disponibilidad({ producto }) {
  if (!producto?.disponibilidad?.length) return null
  return (
    <ul className="lista-simple">
      {producto.disponibilidad.map((d) => <li key={d.sede_id}>{d.sede}: {numero(d.cantidad)} {unidad(producto.unidad_medida, d.cantidad)}</li>)}
    </ul>
  )
}

export const tipoProducto = (tipo) => (tipo === 'materia_prima' ? 'Materia prima' : etiqueta(tipo))
