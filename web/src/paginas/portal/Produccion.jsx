import { useState } from 'react'
import { Barra, Campo, Contenido, Encabezado, Estado, Paginacion } from '../../componentes/comunes.jsx'
import { Barras } from '../../componentes/Graficas.jsx'
import { Modal, ModalComentario } from '../../componentes/Modal.jsx'
import { unidad } from '../../componentes/Productos.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar } from '../../lib/api.js'
import { etiqueta, fecha, hoy, numero, sumarDias } from '../../lib/formato.js'
import { delGiro, esGestion } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

export default function Produccion() {
  const { usuario } = useSesion()
  const productos = useDatos('/productos?por_pagina=100')
  return (
    <>
      <Encabezado titulo="Producción" descripcion="Extracción por turno en las plantas mineras y órdenes de producción en las plantas de proceso. Todo entra al inventario de la sede." />
      {delGiro(usuario, 'MINERIA') && <Extraccion productos={productos.datos ?? []} />}
      {delGiro(usuario, 'PROCESO') && <Ordenes productos={productos.datos ?? []} />}
    </>
  )
}

function Extraccion({ productos }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const [desde, setDesde] = useState(sumarDias(hoy(), -7))
  const [pagina, setPagina] = useState(1)
  const registros = useDatos(`/produccion/extraccion${consulta({ desde, pagina })}`)
  const plantas = useDatos('/sedes?tipo=planta_extraccion')
  // Materias primas que extraen los giros dueños de las plantas de extracción
  const girosPlantas = new Set(plantas.datos?.map((s) => s.giro_id))
  const materias = productos.filter((p) => p.tipo === 'materia_prima' && girosPlantas.has(p.giro_id))

  const registrar = async (e) => {
    e.preventDefault()
    const formulario = e.currentTarget
    const datos = Object.fromEntries([...new FormData(formulario)].filter(([, v]) => v !== ''))
    try {
      const r = await enviar('/produccion/extraccion', { ...datos, sede_id: Number(datos.sede_id), producto_id: Number(datos.producto_id), cantidad: Number(datos.cantidad) })
      avisos.exito(`${numero(r.cantidad)} ${unidad(r.unidad_medida, r.cantidad)} de ${r.producto} registradas. Existencia en ${r.sede}: ${numero(r.existencia_nueva)}`)
      formulario.reset()
      registros.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <section className="tarjeta-panel">
      <h2>Extracción minera</h2>
      <form className="formulario formulario-linea" onSubmit={registrar}>
        <Campo etiqueta="Planta">
          <select name="sede_id" required defaultValue={usuario.sede_id ?? ''}>
            <option value="" disabled>Seleccione</option>
            {plantas.datos?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Materia prima">
          <select name="producto_id" required defaultValue="">
            <option value="" disabled>Seleccione</option>
            {materias.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({unidad(p.unidad_medida)})</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Cantidad"><input name="cantidad" type="number" min="0.01" step="any" required /></Campo>
        <Campo etiqueta="Turno">
          <select name="turno" defaultValue="">
            <option value="">Según la hora</option>
            <option value="diurno">Diurno</option>
            <option value="nocturno">Nocturno</option>
          </select>
        </Campo>
        <Campo etiqueta="Fecha"><input name="fecha" type="date" max={hoy()} defaultValue={hoy()} /></Campo>
        <button className="boton" type="submit">Registrar extracción</button>
      </form>
      <div className="filtros">
        <label className="campo-linea">Desde <input type="date" value={desde} max={hoy()} onChange={(e) => { setDesde(e.target.value); setPagina(1) }} /></label>
      </div>
      <Contenido consulta={registros} vacio="No hay extracción registrada en el periodo.">
        {registros.respuesta?.resumen?.length > 0 && (
          <Barras filas={registros.respuesta.resumen} etiqueta={(r) => r.producto} formato={(v) => numero(v)} series={[{ campo: 'total', nombre: 'Total extraído' }]} />
        )}
        <div className="tabla">
          <table>
            <thead><tr><th>Fecha</th><th>Turno</th><th>Planta</th><th>Materia prima</th><th>Cantidad</th><th>Registró</th></tr></thead>
            <tbody>
              {registros.datos?.map((r) => (
                <tr key={r.id}>
                  <td>{fecha(r.fecha)}</td><td>{etiqueta(r.turno)}</td><td>{r.sede}</td><td>{r.producto}</td>
                  <td className="numero">{numero(r.cantidad)} {unidad(r.unidad_medida, r.cantidad)}</td><td>{r.registrado_por}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Paginacion paginacion={registros.respuesta?.paginacion} onCambiar={setPagina} />
    </section>
  )
}

function Ordenes({ productos }) {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const [estado, setEstado] = useState('')
  const ordenes = useDatos(`/produccion/ordenes${consulta({ estado })}`)
  const [nueva, setNueva] = useState(false)
  const [producir, setProducir] = useState(null)
  const [cancelar, setCancelar] = useState(null)

  const actualizar = async (orden, datos, mensaje) => {
    try {
      await enviar(`/produccion/ordenes/${orden.id}`, datos, 'PATCH')
      avisos.exito(mensaje)
      setProducir(null)
      setCancelar(null)
      ordenes.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <section className="tarjeta-panel">
      <div className="fila-entre">
        <h2>Órdenes de producción</h2>
        {esGestion(usuario) && <button type="button" className="boton" onClick={() => setNueva(true)}>Nueva orden</button>}
      </div>
      <div className="filtros">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {['planificada', 'en_proceso', 'finalizada', 'cancelada'].map((e) => <option key={e} value={e}>{etiqueta(e)}</option>)}
        </select>
      </div>
      <Contenido consulta={ordenes} vacio="No hay órdenes de producción.">
        <div className="tarjetas tarjetas-lista">
          {ordenes.datos?.map((o) => (
            <article key={o.id} className="tarjeta">
              <div className="fila-entre"><strong>{o.codigo}</strong><Estado valor={o.estado} /></div>
              <h3>{o.producto}</h3>
              <p>{o.sede} · inicio {fecha(o.fecha_inicio)}{o.fecha_fin && ` · fin ${fecha(o.fecha_fin)}`}</p>
              <Barra valor={o.avance ?? 0} />
              <p>{numero(o.cantidad_producida)} de {numero(o.cantidad_planificada)} {unidad(o.unidad_medida, o.cantidad_planificada)} ({numero(o.avance ?? 0)} %)</p>
              {['planificada', 'en_proceso'].includes(o.estado) && (
                <div className="acciones-tarjeta">
                  <button type="button" className="boton boton-chico" onClick={() => setProducir(o)}>Registrar producción</button>
                  {o.estado === 'en_proceso' && <button type="button" className="boton boton-azul boton-chico" onClick={() => actualizar(o, { estado: 'finalizada' }, `${o.codigo} finalizada`)}>Finalizar</button>}
                  <button type="button" className="boton boton-peligro boton-chico" onClick={() => setCancelar(o)}>Cancelar</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </Contenido>
      {nueva && <NuevaOrden productos={productos} onCerrar={() => setNueva(false)} onCreada={() => { setNueva(false); ordenes.recargar() }} />}
      {producir && <RegistrarProduccion orden={producir} productos={productos} onCerrar={() => setProducir(null)} onGuardar={(datos) => actualizar(producir, datos, 'Producción registrada en el inventario')} />}
      <ModalComentario abierto={Boolean(cancelar)} titulo={`Cancelar ${cancelar?.codigo ?? ''}`} etiqueta="Motivo" requerido peligro textoBoton="Cancelar orden"
        onCerrar={() => setCancelar(null)} onConfirmar={(comentario) => actualizar(cancelar, { estado: 'cancelada', comentario }, 'Orden cancelada')} />
    </section>
  )
}

function NuevaOrden({ productos, onCerrar, onCreada }) {
  const avisos = useAvisos()
  const plantas = useDatos('/sedes?tipo=planta_proceso')
  const [sede, setSede] = useState('')
  const giroSede = plantas.datos?.find((s) => String(s.id) === sede)?.giro_id

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    try {
      const orden = await enviar('/produccion/ordenes', { ...datos, sede_id: Number(datos.sede_id), producto_id: Number(datos.producto_id), cantidad_planificada: Number(datos.cantidad_planificada) })
      avisos.exito(`Orden ${orden.codigo} creada`)
      onCreada()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo="Nueva orden de producción" onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <Campo etiqueta="Planta de proceso">
          <select name="sede_id" required value={sede} onChange={(e) => setSede(e.target.value)}>
            <option value="" disabled>Seleccione</option>
            {plantas.datos?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Producto">
          <select name="producto_id" required defaultValue="" disabled={!giroSede}>
            <option value="" disabled>{giroSede ? 'Seleccione' : 'Primero elija la planta'}</option>
            {productos.filter((p) => p.tipo === 'producto' && p.giro_id === giroSede).map((p) => <option key={p.id} value={p.id}>{p.nombre} ({unidad(p.unidad_medida)})</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Cantidad planificada"><input name="cantidad_planificada" type="number" min="1" step="any" required /></Campo>
        <Campo etiqueta="Fecha de inicio"><input name="fecha_inicio" type="date" min={hoy()} defaultValue={hoy()} /></Campo>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Crear orden</button>
        </div>
      </form>
    </Modal>
  )
}

// La producción entra al inventario; la materia prima consumida sale (si baja del mínimo, se alerta)
function RegistrarProduccion({ orden, productos, onCerrar, onGuardar }) {
  const [consumos, setConsumos] = useState([])
  const materias = productos.filter((p) => p.tipo === 'materia_prima')
  const cambiarConsumo = (i, campo, valor) => setConsumos((c) => c.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))

  const guardar = (e) => {
    e.preventDefault()
    const cantidad = Number(new FormData(e.currentTarget).get('cantidad'))
    const lista = consumos.filter((c) => c.producto_id && c.cantidad).map((c) => ({ producto_id: Number(c.producto_id), cantidad: Number(c.cantidad) }))
    onGuardar({ cantidad, ...(lista.length && { consumos: lista }) })
  }

  return (
    <Modal abierto titulo={`Registrar producción: ${orden.codigo}`} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <p className="ayuda">{orden.producto} en {orden.sede}. Llevan {numero(orden.cantidad_producida)} de {numero(orden.cantidad_planificada)} {unidad(orden.unidad_medida, orden.cantidad_planificada)}.</p>
        <Campo etiqueta={`Cantidad producida (${unidad(orden.unidad_medida)})`}><input name="cantidad" type="number" min="0.01" step="any" required /></Campo>
        <fieldset className="lineas">
          <legend>Materia prima consumida (opcional)</legend>
          {consumos.map((c, i) => (
            <div key={i} className="linea-producto">
              <select value={c.producto_id} onChange={(e) => cambiarConsumo(i, 'producto_id', e.target.value)} aria-label="Materia prima">
                <option value="">Seleccione</option>
                {materias.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({unidad(p.unidad_medida)})</option>)}
              </select>
              <input type="number" min="0.01" step="any" placeholder="Cantidad" value={c.cantidad} onChange={(e) => cambiarConsumo(i, 'cantidad', e.target.value)} aria-label="Cantidad consumida" />
              <button type="button" className="boton-texto" onClick={() => setConsumos((x) => x.filter((_, j) => j !== i))}>Quitar</button>
            </div>
          ))}
          <button type="button" className="boton-texto" onClick={() => setConsumos((x) => [...x, { producto_id: '', cantidad: '' }])}>+ Agregar consumo</button>
        </fieldset>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Registrar</button>
        </div>
      </form>
    </Modal>
  )
}
