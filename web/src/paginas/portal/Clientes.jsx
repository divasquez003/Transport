import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Campo, Contenido, Encabezado, Estado, Paginacion } from '../../componentes/comunes.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar } from '../../lib/api.js'
import { etiqueta, fecha, haceCuanto, numero, quetzales } from '../../lib/formato.js'
import { esCentral, esGestion, tiene, VENTAS } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

export default function Clientes() {
  const { id } = useParams()
  const { usuario } = useSesion()
  const navegar = useNavigate()
  const [filtros, setFiltros] = useState({ buscar: '', tipo: '', pagina: 1 })
  const lista = useDatos(`/clientes${consulta(filtros)}`)
  const [formulario, setFormulario] = useState(null)

  return (
    <>
      <Encabezado titulo="Clientes" descripcion="Relación de cada cliente con todos los giros de negocio.">
        {tiene(usuario, VENTAS) && <button type="button" className="boton" onClick={() => setFormulario({})}>Nuevo cliente</button>}
      </Encabezado>
      <div className="filtros">
        <input type="search" placeholder="Nombre, NIT o correo" defaultValue={filtros.buscar} aria-label="Buscar"
          onKeyDown={(e) => e.key === 'Enter' && setFiltros({ ...filtros, buscar: e.currentTarget.value.trim(), pagina: 1 })} />
        <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value, pagina: 1 })} aria-label="Tipo">
          <option value="">Empresas y personas</option>
          <option value="empresa">Empresas</option>
          <option value="persona">Personas</option>
        </select>
      </div>
      <Contenido consulta={lista} vacio="No hay clientes con esa búsqueda.">
        <div className="tabla">
          <table className="tabla-clic">
            <thead><tr><th>Cliente</th><th>NIT</th><th>Contacto</th><th>Pedidos</th><th>Total comprado</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.datos?.map((c) => (
                <tr key={c.id} onClick={() => navegar(`/portal/clientes/${c.id}`)}>
                  <td><strong>{c.nombre}</strong><br /><small>{etiqueta(c.tipo)}{c.es_extranjero ? ' · extranjero' : ''}</small></td>
                  <td>{c.nit ?? 'CF'}</td>
                  <td>{c.correo}<br /><small>{c.telefono}</small></td>
                  <td className="numero">{c.total_pedidos}</td>
                  <td className="numero">{quetzales(c.total_comprado)}</td>
                  <td>{c.activo ? <Estado valor="confirmado" texto="Activo" /> : <Estado valor="cancelado" texto="Inactivo" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Paginacion paginacion={lista.respuesta?.paginacion} onCambiar={(p) => setFiltros({ ...filtros, pagina: p })} />
      {id && <Ficha id={id} onCerrar={() => navegar('/portal/clientes')} onEditar={(c) => setFormulario(c)} />}
      {formulario && (
        <FormularioCliente cliente={formulario} onCerrar={() => setFormulario(null)}
          onGuardado={(c) => { setFormulario(null); lista.recargar(); navegar(`/portal/clientes/${c.id}`) }} />
      )}
    </>
  )
}

function Ficha({ id, onCerrar, onEditar }) {
  const { usuario } = useSesion()
  const consultaCliente = useDatos(`/clientes/${id}`)
  const c = consultaCliente.datos
  return (
    <Modal abierto titulo={c?.nombre ?? 'Cliente'} onCerrar={onCerrar} ancho>
      <Contenido consulta={consultaCliente}>
        {c && (
          <>
            <dl className="datos datos-linea">
              <dt>NIT</dt><dd>{c.nit ?? 'CF'}</dd>
              <dt>Correo</dt><dd>{c.correo ?? '—'}</dd>
              <dt>Teléfono</dt><dd>{c.telefono ?? '—'}</dd>
              <dt>Dirección</dt><dd>{c.direccion ?? '—'}</dd>
              <dt>Cliente desde</dt><dd>{fecha(c.creado_en)}</dd>
              <dt>Reuniones pendientes</dt><dd>{c.reuniones_pendientes}</dd>
            </dl>
            <h3>Compras por giro de negocio</h3>
            {c.resumen_por_giro.length ? (
              <div className="tabla">
                <table>
                  <thead><tr><th>Giro</th><th>Pedidos</th><th>Total comprado</th><th>Último pedido</th></tr></thead>
                  <tbody>
                    {c.resumen_por_giro.map((g) => (
                      <tr key={g.giro_id}><td>{g.giro}</td><td className="numero">{g.pedidos}</td><td className="numero">{quetzales(g.total_comprado)}</td><td>{fecha(g.ultimo_pedido)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="vacio">Sin pedidos todavía.</p>}
            <p>{Object.entries(c.pedidos_por_estado).map(([e, n]) => `${etiqueta(e)}: ${numero(n)}`).join(' · ')}</p>
            <h3>Usuarios del portal</h3>
            {c.contactos.length ? (
              <ul className="lista-filas">
                {c.contactos.map((u) => <li key={u.id}><span>{u.nombre} · {u.correo}</span><small>{u.ultimo_acceso ? `Último acceso ${haceCuanto(u.ultimo_acceso)}` : 'Sin accesos'}</small></li>)}
              </ul>
            ) : <p className="vacio">Sin acceso al portal.</p>}
            <div className="acciones">
              <Link className="boton boton-secundario" to={`/portal/reportes?cliente_id=${c.id}`}>Estado de cuenta</Link>
              {tiene(usuario, VENTAS) && <Link className="boton boton-secundario" to={`/portal/pedidos?buscar=${encodeURIComponent(c.nombre)}`}>Ver pedidos</Link>}
              {esGestion(usuario) || tiene(usuario, VENTAS) ? <button type="button" className="boton" onClick={() => onEditar(c)}>Editar datos</button> : null}
            </div>
          </>
        )}
      </Contenido>
    </Modal>
  )
}

function FormularioCliente({ cliente, onCerrar, onGuardado }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const editando = Boolean(cliente.id)
  const [conAcceso, setConAcceso] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    const campos = Object.fromEntries(new FormData(e.currentTarget))
    const datos = Object.fromEntries(Object.entries(campos).filter(([k, v]) => v !== '' && !k.startsWith('contacto_')))
    datos.es_extranjero = campos.es_extranjero === 'on'
    if ('activo' in campos || editando) datos.activo = esCentral(usuario) ? campos.activo === 'on' : undefined
    if (conAcceso) datos.contacto = { nombre: campos.contacto_nombre, correo: campos.contacto_correo, password: campos.contacto_password }
    try {
      const guardado = editando ? await enviar(`/clientes/${cliente.id}`, datos, 'PUT') : await enviar('/clientes', datos)
      avisos.exito(editando ? 'Datos actualizados' : 'Cliente registrado')
      onGuardado(guardado)
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo={editando ? `Editar ${cliente.nombre}` : 'Nuevo cliente'} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <div className="rejilla-campos">
          <Campo etiqueta="Tipo">
            <select name="tipo" defaultValue={cliente.tipo ?? 'empresa'}>
              <option value="empresa">Empresa</option>
              <option value="persona">Persona</option>
            </select>
          </Campo>
          <Campo etiqueta="Nombre o razón social"><input name="nombre" required maxLength={150} defaultValue={cliente.nombre ?? ''} /></Campo>
          <Campo etiqueta="NIT"><input name="nit" maxLength={20} defaultValue={cliente.nit ?? ''} /></Campo>
          <Campo etiqueta="Correo"><input name="correo" type="email" maxLength={120} defaultValue={cliente.correo ?? ''} /></Campo>
          <Campo etiqueta="Teléfono"><input name="telefono" maxLength={20} defaultValue={cliente.telefono ?? ''} /></Campo>
          <Campo etiqueta="Dirección"><input name="direccion" maxLength={200} defaultValue={cliente.direccion ?? ''} /></Campo>
        </div>
        <label className="interruptor"><input type="checkbox" name="es_extranjero" defaultChecked={Boolean(cliente.es_extranjero)} /> Cliente extranjero (importación y exportación)</label>
        {editando && esCentral(usuario) && <label className="interruptor"><input type="checkbox" name="activo" defaultChecked={cliente.activo !== false} /> Activo</label>}
        {!editando && (
          <>
            <label className="interruptor"><input type="checkbox" checked={conAcceso} onChange={(e) => setConAcceso(e.target.checked)} /> Crear acceso al portal para el contacto</label>
            {conAcceso && (
              <div className="rejilla-campos">
                <Campo etiqueta="Nombre del contacto"><input name="contacto_nombre" required maxLength={100} /></Campo>
                <Campo etiqueta="Correo del contacto"><input name="contacto_correo" type="email" required maxLength={120} /></Campo>
                <Campo etiqueta="Contraseña inicial"><input name="contacto_password" type="password" required minLength={8} maxLength={72} /></Campo>
              </div>
            )}
          </>
        )}
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
