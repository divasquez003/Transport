import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Campo, Contenido, Encabezado, Estado, Paginacion, Pestanas } from '../../componentes/comunes.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { unidad } from '../../componentes/Productos.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, descargar, enviar } from '../../lib/api.js'
import { etiqueta, fechaHora, haceCuanto, numero } from '../../lib/formato.js'
import { esCentral, esGestion } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

export default function Inventario() {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const [parametros, setParametros] = useSearchParams()
  const vista = parametros.get('vista') ?? 'existencias'
  const filtros = { sede_id: parametros.get('sede_id') ?? '', bajo_minimo: parametros.get('bajo_minimo') ?? '' }
  const sedes = useDatos(esCentral(usuario) ? '/sedes' : `/sedes?giro_id=${usuario.giro_id}`)
  const existencias = useDatos(vista === 'existencias' ? `/inventario${consulta(filtros)}` : null)
  const [pagina, setPagina] = useState(1)
  const movimientos = useDatos(vista === 'movimientos' ? `/inventario/movimientos${consulta({ sede_id: filtros.sede_id, pagina })}` : null)
  const [movimiento, setMovimiento] = useState(null)

  const cambiar = (campo, valor) => {
    const nuevos = { ...Object.fromEntries(parametros), [campo]: valor }
    setParametros(Object.fromEntries(Object.entries(nuevos).filter(([, v]) => v)))
    setPagina(1)
  }

  const exportar = async () => {
    try {
      avisos.exito(`Descargado: ${await descargar('/reportes/exportar?reporte=inventario')}`)
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <>
      <Encabezado titulo="Inventario" descripcion="Existencias por sede. Se actualizan con pedidos despachados, pedidos entre giros, extracción y producción.">
        {esGestion(usuario) && <button type="button" className="boton boton-secundario" onClick={exportar}>Exportar a Excel (CSV)</button>}
        <button type="button" className="boton" onClick={() => setMovimiento({})}>Registrar movimiento</button>
      </Encabezado>
      <Pestanas opciones={[{ id: 'existencias', texto: 'Existencias' }, { id: 'movimientos', texto: 'Kardex (movimientos)' }]} activa={vista} onCambiar={(v) => cambiar('vista', v === 'existencias' ? '' : v)} />
      <div className="filtros">
        <select value={filtros.sede_id} onChange={(e) => cambiar('sede_id', e.target.value)} aria-label="Sede">
          <option value="">Todas las sedes</option>
          {sedes.datos?.filter((s) => s.giro_id).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        {vista === 'existencias' && (
          <label className="interruptor"><input type="checkbox" checked={Boolean(filtros.bajo_minimo)} onChange={(e) => cambiar('bajo_minimo', e.target.checked ? '1' : '')} /> Solo bajo el mínimo</label>
        )}
      </div>

      {vista === 'existencias' && (
        <Contenido consulta={existencias} vacio="No hay existencias con esos filtros.">
          <div className="tabla">
            <table>
              <thead><tr><th>Sede</th><th>Código</th><th>Producto</th><th>Existencia</th><th>Mínimo</th><th>Estado</th><th>Actualizado</th><th /></tr></thead>
              <tbody>
                {existencias.datos?.map((e) => (
                  <tr key={`${e.sede_id}-${e.producto_id}`} className={e.bajo_minimo ? 'fila-alerta' : ''}>
                    <td>{e.sede}</td>
                    <td>{e.codigo}</td>
                    <td>{e.producto}</td>
                    <td className="numero">{numero(e.cantidad)} {unidad(e.unidad_medida, e.cantidad)}</td>
                    <td className="numero">{numero(e.minimo)}</td>
                    <td>{e.bajo_minimo ? <Estado valor="cancelado" texto="⚠ Bajo mínimo" /> : <Estado valor="entregado" texto="Suficiente" />}</td>
                    <td><small>{haceCuanto(e.actualizado_en)}</small></td>
                    <td><button type="button" className="boton-texto" onClick={() => setMovimiento({ sede_id: e.sede_id, producto_id: e.producto_id })}>Mover</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Contenido>
      )}

      {vista === 'movimientos' && (
        <>
          <Contenido consulta={movimientos} vacio="No hay movimientos.">
            <div className="tabla">
              <table>
                <thead><tr><th>Fecha</th><th>Sede</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Referencia</th><th>Usuario</th></tr></thead>
                <tbody>
                  {movimientos.datos?.map((m) => (
                    <tr key={m.id}>
                      <td>{fechaHora(m.creado_en)}</td>
                      <td>{m.sede}</td>
                      <td>{m.producto}</td>
                      <td><Estado valor={m.tipo === 'entrada' ? 'entregado' : m.tipo === 'salida' ? 'cancelado' : 'confirmado'} texto={etiqueta(m.tipo)} /></td>
                      <td className="numero">{m.tipo === 'salida' ? '−' : m.tipo === 'entrada' ? '+' : ''}{numero(m.cantidad)} {unidad(m.unidad_medida, m.cantidad)}</td>
                      <td>{m.referencia}</td>
                      <td>{m.usuario ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Contenido>
          <Paginacion paginacion={movimientos.respuesta?.paginacion} onCambiar={setPagina} />
        </>
      )}

      {movimiento && (
        <ModalMovimiento inicial={movimiento} sedes={sedes.datos?.filter((s) => s.giro_id) ?? []} onCerrar={() => setMovimiento(null)}
          onListo={() => { setMovimiento(null); existencias.recargar(); movimientos.recargar() }} />
      )}
    </>
  )
}

// Entrada (compra o producción), salida (consumo, merma) o ajuste por conteo físico
function ModalMovimiento({ inicial, sedes, onCerrar, onListo }) {
  const avisos = useAvisos()
  const productos = useDatos('/productos?por_pagina=100')
  const [tipo, setTipo] = useState('entrada')

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    try {
      const r = await enviar('/inventario/movimientos', { ...datos, sede_id: Number(datos.sede_id), producto_id: Number(datos.producto_id), cantidad: Number(datos.cantidad) })
      avisos.exito(`${r.producto} en ${r.sede}: ${numero(r.existencia_anterior)} → ${numero(r.existencia_nueva)}`)
      onListo()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo="Registrar movimiento de inventario" onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <Campo etiqueta="Sede">
          <select name="sede_id" required defaultValue={inicial.sede_id ?? ''}>
            <option value="" disabled>Seleccione</option>
            {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Producto">
          <select name="producto_id" required defaultValue={inicial.producto_id ?? ''}>
            <option value="" disabled>Seleccione</option>
            {productos.datos?.filter((p) => ['producto', 'materia_prima'].includes(p.tipo)).map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.giro})</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo de movimiento">
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="entrada">Entrada (suma)</option>
            <option value="salida">Salida (resta)</option>
            <option value="ajuste">Ajuste por conteo físico</option>
          </select>
        </Campo>
        <Campo etiqueta={tipo === 'ajuste' ? 'Existencia contada' : 'Cantidad'}><input name="cantidad" type="number" min={tipo === 'ajuste' ? 0 : 0.01} step="any" required /></Campo>
        <Campo etiqueta="Referencia (opcional)"><input name="referencia" maxLength={60} placeholder="Factura, orden o motivo" /></Campo>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Registrar</button>
        </div>
      </form>
    </Modal>
  )
}
