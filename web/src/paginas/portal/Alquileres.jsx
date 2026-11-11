import { useState } from 'react'
import { Link } from 'react-router'
import { Campo, Contenido, Encabezado, Estado, Paginacion, Pestanas } from '../../componentes/comunes.jsx'
import { Modal, ModalComentario } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar, obtener } from '../../lib/api.js'
import { etiqueta, fecha, hoy, numero, quetzales, sumarDias } from '../../lib/formato.js'
import { esCentral, esCliente, esGestion, tiene, VENTAS } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

export default function Alquileres() {
  const { usuario } = useSesion()
  const [vista, setVista] = useState('alquileres')
  const cliente = esCliente(usuario)
  return (
    <>
      <Encabezado titulo={cliente ? 'Mis alquileres' : 'Maquinaria y alquileres'} descripcion={cliente ? 'Reservas y alquileres de maquinaria.' : 'Reservas, entregas y devoluciones; flota de maquinaria para venta y alquiler.'}>
        {cliente && <Link className="boton" to="/maquinaria">Reservar maquinaria</Link>}
      </Encabezado>
      {!cliente && <Pestanas opciones={[{ id: 'alquileres', texto: 'Alquileres' }, { id: 'maquinas', texto: 'Máquinas' }]} activa={vista} onCambiar={setVista} />}
      {vista === 'alquileres' ? <ListaAlquileres /> : <ListaMaquinas />}
    </>
  )
}

function ListaAlquileres() {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const cliente = esCliente(usuario)
  const [filtros, setFiltros] = useState({ estado: '', pagina: 1 })
  const lista = useDatos(`/alquileres${consulta(filtros)}`)
  const [accion, setAccion] = useState(null)
  const [nueva, setNueva] = useState(false)

  const cambiarEstado = async (alquiler, estado, extra = {}) => {
    try {
      const r = await enviar(`/alquileres/${alquiler.id}/estado`, { estado, ...extra }, 'PATCH')
      avisos.exito(`${r.codigo}: ${etiqueta(estado).toLowerCase()}${estado === 'finalizado' ? ` · total ${quetzales(r.total)}` : ''}`)
      setAccion(null)
      lista.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <>
      <div className="filtros">
        <select value={filtros.estado} onChange={(e) => setFiltros({ estado: e.target.value, pagina: 1 })} aria-label="Estado">
          <option value="">Todos los estados</option>
          {['reservado', 'activo', 'finalizado', 'cancelado'].map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
        </select>
        {tiene(usuario, VENTAS) && <button type="button" className="boton" onClick={() => setNueva(true)}>Nueva reserva</button>}
      </div>
      <Contenido consulta={lista} vacio="No hay alquileres.">
        <div className="tabla">
          <table>
            <thead><tr><th>Alquiler</th><th>Máquina</th>{!cliente && <th>Cliente</th>}<th>Fechas</th><th>Días</th><th>Total</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {lista.datos?.map((a) => {
                const vencido = a.estado === 'activo' && a.fecha_fin < hoy()
                return (
                  <tr key={a.id} className={vencido ? 'fila-alerta' : ''}>
                    <td><strong>{a.codigo}</strong></td>
                    <td>{a.tipo_maquina}<br /><small>{a.maquina}</small></td>
                    {!cliente && <td>{a.cliente}</td>}
                    <td>{fecha(a.fecha_inicio)} al {fecha(a.fecha_fin)}{a.fecha_devolucion && <><br /><small>Devuelta {fecha(a.fecha_devolucion)}</small></>}{vencido && <><br /><small className="texto-alerta">⚠ Devolución vencida</small></>}</td>
                    <td className="numero">{a.dias}</td>
                    <td className="numero">{quetzales(a.total)}</td>
                    <td><Estado valor={a.estado} /></td>
                    <td className="acciones-fila">
                      {!cliente && a.estado === 'reservado' && <button type="button" className="boton-texto" onClick={() => cambiarEstado(a, 'activo')}>Entregar</button>}
                      {!cliente && a.estado === 'activo' && <button type="button" className="boton-texto" onClick={() => setAccion({ alquiler: a, estado: 'finalizado' })}>Recibir</button>}
                      {a.estado === 'reservado' && <button type="button" className="boton-texto" onClick={() => setAccion({ alquiler: a, estado: 'cancelado' })}>Cancelar</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Paginacion paginacion={lista.respuesta?.paginacion} onCambiar={(p) => setFiltros({ ...filtros, pagina: p })} />
      <ModalComentario abierto={accion?.estado === 'cancelado'} titulo="Cancelar reserva" etiqueta="Motivo" requerido peligro textoBoton="Cancelar reserva"
        onCerrar={() => setAccion(null)} onConfirmar={(comentario) => cambiarEstado(accion.alquiler, 'cancelado', { comentario })} />
      <ModalComentario abierto={accion?.estado === 'finalizado'} titulo={`Recibir máquina ${accion?.alquiler.maquina ?? ''}`} etiqueta="Observaciones de la devolución" textoBoton="Finalizar alquiler"
        onCerrar={() => setAccion(null)}
        onConfirmar={(comentario) => cambiarEstado(accion.alquiler, 'finalizado', { fecha_devolucion: document.getElementById('fecha-devolucion').value, ...(comentario && { comentario }) })}>
        <Campo etiqueta="Fecha de devolución" ayuda="Si es posterior a la fecha acordada se cobran los días adicionales.">
          <input id="fecha-devolucion" type="date" required defaultValue={hoy()} min={accion?.alquiler.fecha_inicio} />
        </Campo>
      </ModalComentario>
      {nueva && <NuevaReserva onCerrar={() => setNueva(false)} onCreada={() => { setNueva(false); lista.recargar() }} />}
    </>
  )
}

function NuevaReserva({ onCerrar, onCreada }) {
  const avisos = useAvisos()
  const clientes = useDatos('/clientes?activo=1&por_pagina=100')
  const maquinas = useDatos('/maquinas')
  const [datos, setDatos] = useState({ maquina_id: '', fecha_inicio: sumarDias(hoy(), 1), fecha_fin: sumarDias(hoy(), 3) })
  const [disponibilidad, setDisponibilidad] = useState(null)

  const actualizar = async (cambios) => {
    const nuevos = { ...datos, ...cambios }
    setDatos(nuevos)
    setDisponibilidad(null)
    if (nuevos.maquina_id && nuevos.fecha_inicio && nuevos.fecha_fin && nuevos.fecha_fin >= nuevos.fecha_inicio) {
      try {
        setDisponibilidad(await obtener(`/maquinas/${nuevos.maquina_id}/disponibilidad${consulta({ fecha_inicio: nuevos.fecha_inicio, fecha_fin: nuevos.fecha_fin })}`))
      } catch {
        setDisponibilidad(null)
      }
    }
  }

  const guardar = async (e) => {
    e.preventDefault()
    const clienteId = Number(new FormData(e.currentTarget).get('cliente_id'))
    try {
      const a = await enviar('/alquileres', { ...datos, maquina_id: Number(datos.maquina_id), cliente_id: clienteId })
      avisos.exito(`Reserva ${a.codigo} por ${quetzales(a.total)}`)
      onCreada()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo="Nueva reserva de maquinaria" onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <Campo etiqueta="Cliente">
          <select name="cliente_id" required defaultValue="">
            <option value="" disabled>Seleccione</option>
            {clientes.datos?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Máquina">
          <select required value={datos.maquina_id} onChange={(e) => actualizar({ maquina_id: e.target.value })}>
            <option value="" disabled>Seleccione</option>
            {maquinas.datos?.filter((m) => m.tarifa_diaria && !['vendida', 'mantenimiento'].includes(m.estado)).map((m) => (
              <option key={m.id} value={m.id}>{m.tipo} {m.codigo} · {quetzales(m.tarifa_diaria)}/día · {m.sede}</option>
            ))}
          </select>
        </Campo>
        <div className="rejilla-campos">
          <Campo etiqueta="Desde"><input type="date" required min={hoy()} value={datos.fecha_inicio} onChange={(e) => actualizar({ fecha_inicio: e.target.value })} /></Campo>
          <Campo etiqueta="Hasta"><input type="date" required min={datos.fecha_inicio} value={datos.fecha_fin} onChange={(e) => actualizar({ fecha_fin: e.target.value })} /></Campo>
        </div>
        {disponibilidad && (
          <p className={disponibilidad.disponible ? 'exito' : 'texto-alerta'}>
            {disponibilidad.disponible
              ? `Disponible: ${disponibilidad.dias} días por ${quetzales(disponibilidad.total_estimado)}`
              : `${disponibilidad.motivo}${disponibilidad.ocupado.length ? `: ${disponibilidad.ocupado.map((o) => `${fecha(o.fecha_inicio)} al ${fecha(o.fecha_fin)}`).join(', ')}` : ''}`}
          </p>
        )}
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton" disabled={disponibilidad && !disponibilidad.disponible}>Reservar</button>
        </div>
      </form>
    </Modal>
  )
}

function ListaMaquinas() {
  const { usuario } = useSesion()
  const [estado, setEstado] = useState('')
  const maquinas = useDatos(`/maquinas${consulta({ estado })}`)
  const [editar, setEditar] = useState(null)
  return (
    <>
      <div className="filtros">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {['disponible', 'alquilada', 'en_uso', 'mantenimiento', 'vendida'].map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
        </select>
        {esGestion(usuario) && <button type="button" className="boton" onClick={() => setEditar({})}>Registrar máquina</button>}
      </div>
      <Contenido consulta={maquinas} vacio="No hay máquinas.">
        <div className="tabla">
          <table>
            <thead><tr><th>Código</th><th>Máquina</th><th>Sucursal</th><th>Tarifa diaria</th><th>Precio de venta</th><th>Horómetro</th><th>GPS</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {maquinas.datos?.map((m) => (
                <tr key={m.id}>
                  <td>{m.codigo}</td>
                  <td>{m.tipo}<br /><small>{m.marca} {m.modelo} {m.anio}</small></td>
                  <td>{m.sede ?? '—'}</td>
                  <td className="numero">{quetzales(m.tarifa_diaria)}</td>
                  <td className="numero">{m.precio_venta ? quetzales(m.precio_venta) : '—'}</td>
                  <td className="numero">{m.horometro != null ? `${numero(m.horometro)} h` : '—'}</td>
                  <td>{m.gps_dispositivo_id ? <Link to="/portal/gps">Ver en mapa</Link> : '—'}</td>
                  <td><Estado valor={m.estado} /></td>
                  <td>{esGestion(usuario) && <button type="button" className="boton-texto" onClick={() => setEditar(m)}>Editar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      {editar && <FormularioMaquina maquina={editar} onCerrar={() => setEditar(null)} onGuardada={() => { setEditar(null); maquinas.recargar() }} />}
    </>
  )
}

function FormularioMaquina({ maquina, onCerrar, onGuardada }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const editando = Boolean(maquina.id)
  // La sede central registra las máquinas en el giro de maquinaria
  const giros = useDatos(!maquina.giro_id && esCentral(usuario) ? '/giros' : null)
  const giroId = maquina.giro_id ?? (esCentral(usuario) ? giros.datos?.find((g) => g.codigo === 'MAQUINARIA')?.id : usuario.giro_id)
  const sedes = useDatos(giroId ? `/sedes?giro_id=${giroId}` : null)
  const servicios = useDatos(giroId ? `/productos?giro_id=${giroId}&tipo=alquiler` : null)

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    for (const campo of ['sede_id', 'producto_id', 'anio', 'tarifa_diaria', 'precio_venta', 'horometro']) if (datos[campo]) datos[campo] = Number(datos[campo])
    try {
      if (editando) await enviar(`/maquinas/${maquina.id}`, datos, 'PUT')
      else await enviar('/maquinas', { ...datos, ...(esCentral(usuario) && { giro_id: giroId }) })
      avisos.exito(editando ? 'Máquina actualizada' : 'Máquina registrada')
      onGuardada()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo={editando ? `Editar ${maquina.codigo}` : 'Registrar máquina'} onCerrar={onCerrar} ancho>
      <form className="formulario" onSubmit={guardar}>
        <div className="rejilla-campos">
          <Campo etiqueta="Código"><input name="codigo" required maxLength={30} defaultValue={maquina.codigo ?? ''} placeholder="MQ-RET-03" /></Campo>
          <Campo etiqueta="Tipo"><input name="tipo" required maxLength={60} defaultValue={maquina.tipo ?? ''} placeholder="Retroexcavadora" /></Campo>
          <Campo etiqueta="Marca"><input name="marca" maxLength={60} defaultValue={maquina.marca ?? ''} /></Campo>
          <Campo etiqueta="Modelo"><input name="modelo" maxLength={60} defaultValue={maquina.modelo ?? ''} /></Campo>
          <Campo etiqueta="Año"><input name="anio" type="number" min="1950" max="2100" defaultValue={maquina.anio ?? ''} /></Campo>
          <Campo etiqueta="Sucursal">
            <select name="sede_id" defaultValue={maquina.sede_id ?? ''}>
              <option value="">Sin asignar</option>
              {sedes.datos?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Servicio de alquiler">
            <select name="producto_id" defaultValue={maquina.producto_id ?? ''}>
              <option value="">Ninguno</option>
              {servicios.datos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Tarifa diaria (Q)"><input name="tarifa_diaria" type="number" min="0" step="0.01" defaultValue={maquina.tarifa_diaria ?? ''} /></Campo>
          <Campo etiqueta="Precio de venta (Q)"><input name="precio_venta" type="number" min="0" step="0.01" defaultValue={maquina.precio_venta ?? ''} /></Campo>
          <Campo etiqueta="Horómetro (h)"><input name="horometro" type="number" min="0" step="0.1" defaultValue={maquina.horometro ?? ''} /></Campo>
          {(!editando || maquina.estado !== 'alquilada') && (
            <Campo etiqueta="Estado">
              <select name="estado" defaultValue={maquina.estado ?? 'disponible'}>
                {['disponible', 'en_uso', 'mantenimiento', 'vendida'].map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
              </select>
            </Campo>
          )}
        </div>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
