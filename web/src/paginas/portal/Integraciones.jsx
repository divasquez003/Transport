import { useState } from 'react'
import { Campo, Contenido, Encabezado, Estado, Paginacion, Pestanas } from '../../componentes/comunes.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { api, consulta, descargar, enviar } from '../../lib/api.js'
import { etiqueta, fechaHora, haceCuanto, hoy, sumarDias } from '../../lib/formato.js'
import { esCentral } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

// Plantillas CSV de ejemplo para cada importación (se descargan desde el navegador)
const PLANTILLAS = {
  pedidos: `referencia,nit,codigo_producto,cantidad,fecha_entrega,direccion_entrega\nOC-1001,4567812-3,PRO-001,120,${sumarDias(hoy(), 5)},Obra zona 3 Xela\nOC-1001,4567812-3,PRO-006,20,${sumarDias(hoy(), 5)},Obra zona 3 Xela\n`,
  gastos: `fecha,categoria,descripcion,monto,documento\n${hoy()},combustible,Diésel flota,15250.50,FAC-2201\n`,
  inventario: 'sede_id,codigo_producto,cantidad\n6,PRO-001,8150\n6,PRO-006,1180\n'
}
const AYUDA = {
  pedidos: 'Las filas con la misma referencia forman un pedido. El cliente se identifica por su NIT.',
  gastos: 'Gastos del giro (la sede central agrega la columna giro_id). Los montos aceptan coma de miles.',
  inventario: 'Conteo físico: la cantidad del archivo reemplaza la existencia y queda como ajuste en el kardex.'
}

function bajarPlantilla(tipo) {
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(new Blob([`﻿${PLANTILLAS[tipo]}`], { type: 'text/csv' }))
  enlace.download = `plantilla_${tipo}.csv`
  enlace.click()
}

export default function Integraciones() {
  const { usuario } = useSesion()
  const central = esCentral(usuario)
  const [vista, setVista] = useState('edi')
  return (
    <>
      <Encabezado titulo="Integraciones" descripcion="Intercambio de información con sistemas de terceros: archivos CSV (EDI), API REST con API key y webhooks." />
      {central && (
        <Pestanas
          opciones={[{ id: 'edi', texto: 'Archivos CSV (EDI)' }, { id: 'claves', texto: 'API keys' }, { id: 'webhooks', texto: 'Webhooks' }, { id: 'bitacora', texto: 'Bitácora' }]}
          activa={vista}
          onCambiar={setVista}
        />
      )}
      {vista === 'edi' && <Edi />}
      {vista === 'claves' && <Claves />}
      {vista === 'webhooks' && <Webhooks />}
      {vista === 'bitacora' && <Bitacora />}
    </>
  )
}

function Edi() {
  const avisos = useAvisos()
  const [tipo, setTipo] = useState('pedidos')
  const [resultado, setResultado] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [exportar, setExportar] = useState({ tipo: 'pedidos', desde: sumarDias(hoy(), -30), hasta: hoy() })

  const importar = async (e) => {
    e.preventDefault()
    const archivo = new FormData(e.currentTarget).get('archivo')
    if (!archivo?.size) return avisos.error('Seleccione un archivo CSV')
    setEnviando(true)
    try {
      const contenido = await archivo.text()
      const respuesta = await api('/integraciones/edi/importar', { metodo: 'POST', cuerpo: { tipo, archivo: archivo.name, contenido } })
      setResultado(respuesta.data)
      avisos.exito(respuesta.mensaje)
    } catch (error) {
      // Si ninguna fila se pudo importar, la API responde 422 con el detalle de cada fila
      setResultado(error.cuerpo?.data ?? null)
      avisos.error(error)
    } finally {
      setEnviando(false)
    }
  }

  const bajar = async () => {
    try {
      avisos.exito(`Descargado: ${await descargar(`/integraciones/edi/exportar${consulta(exportar)}`)}`)
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <div className="rejilla-panel">
      <section className="tarjeta-panel">
        <h2>Importar archivo CSV</h2>
        <form className="formulario" onSubmit={importar}>
          <Campo etiqueta="Tipo de archivo">
            <select value={tipo} onChange={(e) => { setTipo(e.target.value); setResultado(null) }}>
              <option value="pedidos">Pedidos de clientes (órdenes de compra)</option>
              <option value="gastos">Gastos</option>
              <option value="inventario">Conteo de inventario</option>
            </select>
          </Campo>
          <p className="ayuda">{AYUDA[tipo]} <button type="button" className="boton-texto" onClick={() => bajarPlantilla(tipo)}>Descargar plantilla</button></p>
          <Campo etiqueta="Archivo (separado por coma o punto y coma, como lo guarda Excel)"><input name="archivo" type="file" accept=".csv,text/csv" required /></Campo>
          <button type="submit" className="boton" disabled={enviando}>{enviando ? 'Importando...' : 'Importar'}</button>
        </form>
        {resultado && (
          <div className="resultado-importacion">
            <p><strong>{resultado.importados}</strong> de {resultado.filas} filas importadas de {resultado.archivo}.{resultado.creados?.length > 0 && ` Creados: ${resultado.creados.join(', ')}.`}</p>
            {resultado.errores.length > 0 && (
              <div className="tabla">
                <table>
                  <thead><tr><th>Fila</th><th>Referencia</th><th>Error</th></tr></thead>
                  <tbody>{resultado.errores.map((e, i) => <tr key={i}><td>{e.fila}</td><td>{e.referencia ?? '—'}</td><td>{e.mensaje}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
      <section className="tarjeta-panel">
        <h2>Exportar a CSV</h2>
        <div className="formulario">
          <Campo etiqueta="Información">
            <select value={exportar.tipo} onChange={(e) => setExportar({ ...exportar, tipo: e.target.value })}>
              <option value="pedidos">Pedidos con su detalle</option>
              <option value="viajes">Viajes</option>
              <option value="movimientos">Movimientos de inventario</option>
              <option value="inventario">Existencias actuales</option>
            </select>
          </Campo>
          {exportar.tipo !== 'inventario' && (
            <div className="rejilla-campos">
              <Campo etiqueta="Desde"><input type="date" value={exportar.desde} max={exportar.hasta} onChange={(e) => setExportar({ ...exportar, desde: e.target.value })} /></Campo>
              <Campo etiqueta="Hasta"><input type="date" value={exportar.hasta} min={exportar.desde} onChange={(e) => setExportar({ ...exportar, hasta: e.target.value })} /></Campo>
            </div>
          )}
          <button type="button" className="boton boton-azul" onClick={bajar}>Descargar CSV</button>
          <p className="ayuda">El archivo usa UTF-8 con BOM para que Excel muestre bien las tildes. Cada exportación queda en la bitácora.</p>
        </div>
      </section>
    </div>
  )
}

function Claves() {
  const avisos = useAvisos()
  const lista = useDatos('/integraciones/api-claves')
  const clientes = useDatos('/clientes?activo=1&por_pagina=100')
  const [nueva, setNueva] = useState(false)
  const [creada, setCreada] = useState(null)

  const crear = async (e) => {
    e.preventDefault()
    const campos = new FormData(e.currentTarget)
    try {
      const r = await enviar('/integraciones/api-claves', { cliente_id: Number(campos.get('cliente_id')), nombre: campos.get('nombre'), permisos: campos.getAll('permisos') })
      setNueva(false)
      setCreada(r)
      lista.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <section className="tarjeta-panel">
      <div className="fila-entre">
        <h2>API keys de clientes</h2>
        <button type="button" className="boton" onClick={() => setNueva(true)}>Nueva API key</button>
      </div>
      <p className="ayuda">Los sistemas de los clientes consultan y crean pedidos y siguen sus viajes en <code>/api/externo/...</code> con el encabezado <code>X-API-Key</code>.</p>
      <Contenido consulta={lista} vacio="No hay API keys.">
        <div className="tabla">
          <table>
            <thead><tr><th>Cliente</th><th>Nombre</th><th>Prefijo</th><th>Permisos</th><th>Último uso</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.datos?.map((k) => (
                <tr key={k.id}>
                  <td>{k.cliente}</td><td>{k.nombre}</td><td><code>{k.prefijo}…</code></td><td>{k.permisos}</td>
                  <td>{k.ultimo_uso ? haceCuanto(k.ultimo_uso) : 'Nunca'}</td>
                  <td>{k.activo ? <Estado valor="entregado" texto="Activa" /> : <Estado valor="cancelado" texto="Inactiva" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      {nueva && (
        <Modal abierto titulo="Nueva API key" onCerrar={() => setNueva(false)}>
          <form className="formulario" onSubmit={crear}>
            <Campo etiqueta="Cliente">
              <select name="cliente_id" required defaultValue="">
                <option value="" disabled>Seleccione</option>
                {clientes.datos?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Nombre del sistema"><input name="nombre" required maxLength={100} placeholder="ERP de compras" /></Campo>
            <fieldset className="lineas">
              <legend>Permisos</legend>
              <label className="interruptor"><input type="checkbox" name="permisos" value="pedidos:leer" defaultChecked /> Consultar sus pedidos</label>
              <label className="interruptor"><input type="checkbox" name="permisos" value="pedidos:crear" /> Crear pedidos</label>
              <label className="interruptor"><input type="checkbox" name="permisos" value="viajes:leer" /> Seguir sus viajes</label>
            </fieldset>
            <div className="acciones">
              <button type="button" className="boton boton-secundario" onClick={() => setNueva(false)}>Cancelar</button>
              <button type="submit" className="boton">Crear</button>
            </div>
          </form>
        </Modal>
      )}
      {creada && (
        <Modal abierto titulo="API key creada" onCerrar={() => setCreada(null)}>
          <p>Entregue esta clave a <strong>{creada.cliente}</strong>. <strong>No se volverá a mostrar</strong>: en la base de datos solo se guarda su hash.</p>
          <p className="clave-secreta"><code>{creada.clave}</code></p>
          <div className="acciones">
            <button type="button" className="boton boton-secundario" onClick={() => navigator.clipboard?.writeText(creada.clave).then(() => avisos.exito('Clave copiada'))}>Copiar</button>
            <button type="button" className="boton" onClick={() => setCreada(null)}>Listo</button>
          </div>
        </Modal>
      )}
    </section>
  )
}

function Webhooks() {
  const avisos = useAvisos()
  const lista = useDatos('/integraciones/webhooks')
  const clientes = useDatos('/clientes?activo=1&por_pagina=100')
  const [nuevo, setNuevo] = useState(false)
  const [creado, setCreado] = useState(null)

  const crear = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries(new FormData(e.currentTarget))
    try {
      const r = await enviar('/integraciones/webhooks', { ...datos, cliente_id: Number(datos.cliente_id) })
      setNuevo(false)
      setCreado(r)
      lista.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  const eliminar = async (w) => {
    if (!window.confirm(`¿Eliminar el webhook ${w.evento} de ${w.cliente}?`)) return
    try {
      await api(`/integraciones/webhooks/${w.id}`, { metodo: 'DELETE' })
      avisos.exito('Webhook eliminado')
      lista.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <section className="tarjeta-panel">
      <div className="fila-entre">
        <h2>Webhooks</h2>
        <button type="button" className="boton" onClick={() => setNuevo(true)}>Registrar webhook</button>
      </div>
      <p className="ayuda">TransPort avisa al sistema del cliente con un POST firmado (encabezado <code>X-TransPort-Firma</code>, HMAC-SHA256) cuando ocurre el evento.</p>
      <Contenido consulta={lista} vacio="No hay webhooks.">
        <div className="tabla">
          <table>
            <thead><tr><th>Cliente</th><th>Evento</th><th>URL</th><th>Creado</th><th /></tr></thead>
            <tbody>
              {lista.datos?.map((w) => (
                <tr key={w.id}>
                  <td>{w.cliente}</td><td><code>{w.evento}</code></td><td className="url">{w.url}</td><td>{fechaHora(w.creado_en)}</td>
                  <td><button type="button" className="boton-texto" onClick={() => eliminar(w)}>Eliminar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      {nuevo && (
        <Modal abierto titulo="Registrar webhook" onCerrar={() => setNuevo(false)}>
          <form className="formulario" onSubmit={crear}>
            <Campo etiqueta="Cliente">
              <select name="cliente_id" required defaultValue="">
                <option value="" disabled>Seleccione</option>
                {clientes.datos?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Evento">
              <select name="evento" required defaultValue="">
                <option value="" disabled>Seleccione</option>
                {lista.respuesta?.eventos?.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="URL que recibe el aviso"><input name="url" type="url" required maxLength={255} placeholder="https://sistema-del-cliente.com/webhooks/transport" /></Campo>
            <div className="acciones">
              <button type="button" className="boton boton-secundario" onClick={() => setNuevo(false)}>Cancelar</button>
              <button type="submit" className="boton">Registrar</button>
            </div>
          </form>
        </Modal>
      )}
      {creado && (
        <Modal abierto titulo="Webhook registrado" onCerrar={() => setCreado(null)}>
          <p>Secreto para validar la firma de los avisos de <strong>{creado.evento}</strong> (entréguelo al cliente; no se vuelve a mostrar):</p>
          <p className="clave-secreta"><code>{creado.secreto}</code></p>
          <p className="ayuda">{creado.aviso}</p>
          <div className="acciones"><button type="button" className="boton" onClick={() => setCreado(null)}>Listo</button></div>
        </Modal>
      )}
    </section>
  )
}

function Bitacora() {
  const [filtros, setFiltros] = useState({ tipo: '', estado: '', pagina: 1 })
  const lista = useDatos(`/integraciones/bitacora${consulta(filtros)}`)
  return (
    <section className="tarjeta-panel">
      <h2>Bitácora de integraciones</h2>
      <div className="filtros">
        <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value, pagina: 1 })} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {['api_entrada', 'webhook_salida', 'edi_importacion', 'edi_exportacion', 'gps'].map((t) => <option key={t} value={t}>{etiqueta(t)}</option>)}
        </select>
        <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value, pagina: 1 })} aria-label="Estado">
          <option value="">Exitosos y fallidos</option>
          <option value="exitoso">Exitosos</option>
          <option value="fallido">Fallidos</option>
        </select>
      </div>
      <Contenido consulta={lista} vacio="La bitácora está vacía.">
        <div className="tabla">
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Cliente</th><th>Referencia</th><th>Detalle</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.datos?.map((b) => (
                <tr key={b.id}>
                  <td>{fechaHora(b.creado_en)}</td><td>{etiqueta(b.tipo)}</td><td>{b.cliente ?? '—'}</td><td>{b.referencia}</td><td>{b.detalle}</td>
                  <td>{b.estado === 'exitoso' ? <Estado valor="entregado" texto="Exitoso" /> : <Estado valor="cancelado" texto="Fallido" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      <Paginacion paginacion={lista.respuesta?.paginacion} onCambiar={(p) => setFiltros({ ...filtros, pagina: p })} />
    </section>
  )
}
