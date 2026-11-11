import { useState } from 'react'
import { Campo, Contenido, Encabezado, Estado, Paginacion } from '../../componentes/comunes.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { tipoProducto, unidad } from '../../componentes/Productos.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { api, consulta, enviar } from '../../lib/api.js'
import { quetzales } from '../../lib/formato.js'
import { esCentral } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

// Catálogo del giro: alta, edición, baja y reactivación de productos y servicios
export default function Productos() {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const central = esCentral(usuario)
  const [filtros, setFiltros] = useState({ giro_id: central ? '' : usuario.giro_id, buscar: '', pagina: 1 })
  const lista = useDatos(`/productos${consulta({ ...filtros, incluir_inactivos: 1, por_pagina: 25 })}`)
  const giros = useDatos(central ? '/giros' : null)
  const [editar, setEditar] = useState(null)

  const cambiarActivo = async (p) => {
    try {
      if (p.activo) await api(`/productos/${p.id}`, { metodo: 'DELETE' })
      else await enviar(`/productos/${p.id}`, { activo: true }, 'PUT')
      avisos.exito(p.activo ? `${p.nombre} dado de baja` : `${p.nombre} reactivado`)
      lista.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <>
      <Encabezado titulo="Productos y servicios" descripcion="Lo que se publica en la sala de ventas. Los productos por cotización piden agendar una reunión.">
        <button type="button" className="boton" onClick={() => setEditar({})}>Nuevo producto</button>
      </Encabezado>
      <div className="filtros">
        {central && (
          <select value={filtros.giro_id} onChange={(e) => setFiltros({ ...filtros, giro_id: e.target.value, pagina: 1 })} aria-label="Giro">
            <option value="">Todos los giros</option>
            {giros.datos?.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        )}
        <input type="search" placeholder="Buscar" aria-label="Buscar" onKeyDown={(e) => e.key === 'Enter' && setFiltros({ ...filtros, buscar: e.currentTarget.value.trim(), pagina: 1 })} />
      </div>
      <Contenido consulta={lista} vacio="No hay productos.">
        <div className="tabla">
          <table>
            <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Precio</th><th>Venta</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {lista.datos?.map((p) => (
                <tr key={p.id} className={p.activo ? '' : 'atenuado'}>
                  <td>{p.codigo}</td>
                  <td>{p.nombre}{central && <><br /><small>{p.giro}</small></>}</td>
                  <td>{tipoProducto(p.tipo)}</td>
                  <td className="numero">{quetzales(p.precio)} / {unidad(p.unidad_medida)}</td>
                  <td>{p.modalidad_venta === 'en_linea' ? 'En línea' : 'Cotización'}</td>
                  <td>{p.activo ? <Estado valor="entregado" texto="Publicado" /> : <Estado valor="cancelado" texto="De baja" />}</td>
                  <td className="acciones-fila">
                    <button type="button" className="boton-texto" onClick={() => setEditar(p)}>Editar</button>
                    <button type="button" className="boton-texto" onClick={() => cambiarActivo(p)}>{p.activo ? 'Dar de baja' : 'Reactivar'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Paginacion paginacion={lista.respuesta?.paginacion} onCambiar={(p) => setFiltros({ ...filtros, pagina: p })} />
      {editar && <FormularioProducto producto={editar} giros={giros.datos} onCerrar={() => setEditar(null)} onGuardado={() => { setEditar(null); lista.recargar() }} />}
    </>
  )
}

function FormularioProducto({ producto, giros, onCerrar, onGuardado }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const editando = Boolean(producto.id)

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    if (datos.precio) datos.precio = Number(datos.precio)
    try {
      if (editando) await enviar(`/productos/${producto.id}`, datos, 'PUT')
      else await enviar('/productos', datos)
      avisos.exito(editando ? 'Producto actualizado' : 'Producto publicado en el catálogo')
      onGuardado()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo={editando ? `Editar ${producto.nombre}` : 'Nuevo producto o servicio'} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <div className="rejilla-campos">
          {!editando && esCentral(usuario) && (
            <Campo etiqueta="Giro de negocio">
              <select name="giro_id" required defaultValue="">
                <option value="" disabled>Seleccione</option>
                {giros?.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Código"><input name="codigo" required maxLength={30} defaultValue={producto.codigo ?? ''} placeholder="PRO-007" /></Campo>
          <Campo etiqueta="Nombre"><input name="nombre" required maxLength={120} defaultValue={producto.nombre ?? ''} /></Campo>
          <Campo etiqueta="Tipo">
            <select name="tipo" defaultValue={producto.tipo ?? 'producto'}>
              <option value="producto">Producto</option>
              <option value="materia_prima">Materia prima</option>
              <option value="servicio">Servicio</option>
              <option value="alquiler">Alquiler</option>
            </select>
          </Campo>
          <Campo etiqueta="Unidad de medida"><input name="unidad_medida" required maxLength={20} defaultValue={producto.unidad_medida ?? ''} placeholder="m2, tonelada, unidad, viaje" /></Campo>
          <Campo etiqueta="Precio (Q)"><input name="precio" type="number" min="0" step="0.01" required defaultValue={producto.precio ?? ''} /></Campo>
          <Campo etiqueta="Modalidad de venta">
            <select name="modalidad_venta" defaultValue={producto.modalidad_venta ?? 'en_linea'}>
              <option value="en_linea">Pedido en línea</option>
              <option value="cotizacion">Por cotización (reunión con vendedor)</option>
            </select>
          </Campo>
        </div>
        <Campo etiqueta="Descripción"><textarea name="descripcion" rows={3} maxLength={2000} defaultValue={producto.descripcion ?? ''} /></Campo>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
