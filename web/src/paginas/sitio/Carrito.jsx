import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Campo, Vacio } from '../../componentes/comunes.jsx'
import { unidad } from '../../componentes/Productos.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useCarrito } from '../../contexto/carrito.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { enviar } from '../../lib/api.js'
import { hoy, quetzales } from '../../lib/formato.js'
import { esCliente, tiene, VENTAS } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

// Carrito del pedido en línea. El vendedor también lo usa para registrar pedidos de un cliente.
export default function Carrito() {
  const { items, giro, giroId, total, cambiar, quitar, vaciar } = useCarrito()
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const navegar = useNavigate()
  const [enviando, setEnviando] = useState(false)
  const vendedor = tiene(usuario, VENTAS)
  const clientes = useDatos(vendedor ? '/clientes?activo=1&por_pagina=100' : null)
  const sedes = useDatos(giroId ? `/sedes?giro_id=${giroId}` : null)

  if (!items.length) {
    return (
      <main className="contenedor pagina-simple">
        <h1>Carrito</h1>
        <Vacio>Su carrito está vacío.</Vacio>
        <Link className="boton" to="/catalogo">Ir al catálogo</Link>
      </main>
    )
  }

  const confirmar = async (e) => {
    e.preventDefault()
    if (!usuario) return navegar('/ingresar?volver=/carrito')
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    setEnviando(true)
    try {
      const pedido = await enviar('/pedidos', { ...datos, items: items.map((i) => ({ producto_id: i.producto.id, cantidad: Number(i.cantidad) })) })
      vaciar()
      avisos.exito(`Pedido ${pedido.codigo} registrado por ${quetzales(pedido.total)}`)
      navegar(`/portal/pedidos/${pedido.id}`)
    } catch (error) {
      avisos.error(error)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="contenedor">
      <h1>Carrito</h1>
      <p>Pedido a <strong>{giro}</strong>. Cada pedido lleva productos de un solo giro de negocio.</p>
      <div className="tabla">
        <table>
          <thead><tr><th>Producto</th><th>Precio</th><th>Cantidad</th><th>Subtotal</th><th /></tr></thead>
          <tbody>
            {items.map(({ producto, cantidad }) => (
              <tr key={producto.id}>
                <td><strong>{producto.nombre}</strong><br /><small>{producto.codigo}</small></td>
                <td>{quetzales(producto.precio)} / {unidad(producto.unidad_medida)}</td>
                <td>
                  <input className="cantidad" type="number" min="0.01" step="any" value={cantidad}
                    onChange={(e) => cambiar(producto.id, e.target.value === '' ? '' : Number(e.target.value))} aria-label={`Cantidad de ${producto.nombre}`} />
                </td>
                <td>{quetzales(producto.precio * (Number(cantidad) || 0))}</td>
                <td><button type="button" className="boton-texto" onClick={() => quitar(producto.id)}>Quitar</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th colSpan={3}>Total</th><th>{quetzales(total)}</th><th /></tr></tfoot>
        </table>
      </div>

      <form className="formulario panel-formulario" onSubmit={confirmar}>
        <h2>Datos de entrega</h2>
        <div className="rejilla-campos">
          {vendedor && (
            <Campo etiqueta="Cliente">
              <select name="cliente_id" required defaultValue="">
                <option value="" disabled>Seleccione el cliente</option>
                {clientes.datos?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Dirección de entrega"><input name="direccion_entrega" maxLength={200} placeholder="Obra, bodega o dirección" /></Campo>
          <Campo etiqueta="Fecha de entrega deseada"><input name="fecha_entrega" type="date" min={hoy()} /></Campo>
          <Campo etiqueta="Sede que despacha (opcional)">
            <select name="sede_id" defaultValue="">
              <option value="">La que asigne la empresa</option>
              {sedes.datos?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Observaciones" ancho><textarea name="observaciones" rows={2} maxLength={500} /></Campo>
        </div>
        {usuario && !esCliente(usuario) && !vendedor && <p className="ayuda">Su rol no registra pedidos de clientes.</p>}
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={vaciar}>Vaciar carrito</button>
          <button type="submit" className="boton" disabled={enviando}>
            {!usuario ? 'Iniciar sesión para pedir' : enviando ? 'Enviando...' : `Confirmar pedido por ${quetzales(total)}`}
          </button>
        </div>
      </form>
    </main>
  )
}
