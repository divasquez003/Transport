import { etiqueta } from '../lib/formato.js'

// Etiqueta de color según el estado (pendiente, en_ruta, entregado, cancelado...)
export function Estado({ valor, texto }) {
  return <span className={`estado estado-${valor}`}>{texto ?? etiqueta(valor)}</span>
}

export function Cargando({ texto = 'Cargando...' }) {
  return <p className="cargando" role="status">{texto}</p>
}

export function Vacio({ children = 'No hay registros.' }) {
  return <p className="vacio">{children}</p>
}

export function ErrorCarga({ error, reintentar }) {
  if (!error) return null
  return (
    <div className="error-carga" role="alert">
      <span>{error.detalle ?? error.message}</span>
      {reintentar && <button type="button" className="boton-texto" onClick={reintentar}>Reintentar</button>}
    </div>
  )
}

// Estados de una consulta: cargando, error o vacío; si hay datos muestra children
export function Contenido({ consulta, vacio, children }) {
  if (consulta.error && !consulta.respuesta) return <ErrorCarga error={consulta.error} reintentar={consulta.recargar} />
  if (consulta.cargando && !consulta.respuesta) return <Cargando />
  const datos = consulta.datos
  if (Array.isArray(datos) && !datos.length) return <Vacio>{vacio}</Vacio>
  return children
}

export function Paginacion({ paginacion, onCambiar }) {
  if (!paginacion || paginacion.paginas <= 1) return null
  const { pagina, paginas, total } = paginacion
  return (
    <nav className="paginacion" aria-label="Paginación">
      <button type="button" className="boton boton-secundario boton-chico" disabled={pagina <= 1} onClick={() => onCambiar(pagina - 1)}>Anterior</button>
      <span>Página {pagina} de {paginas} · {total} registros</span>
      <button type="button" className="boton boton-secundario boton-chico" disabled={pagina >= paginas} onClick={() => onCambiar(pagina + 1)}>Siguiente</button>
    </nav>
  )
}

// <Campo etiqueta="Nombre"><input /></Campo>
export function Campo({ etiqueta: texto, ayuda, children, ancho }) {
  return (
    <label className={`campo${ancho ? ' campo-ancho' : ''}`}>
      <span>{texto}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  )
}

// Barra de avance; "esperado" dibuja una marca de referencia (por ejemplo, el avance según el plazo)
export function Barra({ valor = 0, esperado, alerta = false }) {
  const ancho = Math.max(0, Math.min(100, Number(valor) || 0))
  return (
    <div className="barra-avance" role="progressbar" aria-valuenow={ancho} aria-valuemin={0} aria-valuemax={100}>
      <div className={`relleno${alerta ? ' relleno-alerta' : ''}`} style={{ width: `${ancho}%` }} />
      {esperado != null && <div className="marca-esperado" style={{ left: `${Math.min(100, esperado)}%` }} title={`Esperado: ${esperado} %`} />}
    </div>
  )
}

// Indicador clave (KPI) con un dato secundario opcional
export function Indicador({ titulo, valor, detalle, tono }) {
  return (
    <div className={`indicador${tono ? ` indicador-${tono}` : ''}`}>
      <span className="indicador-titulo">{titulo}</span>
      <strong className="indicador-valor">{valor}</strong>
      {detalle && <span className="indicador-detalle">{detalle}</span>}
    </div>
  )
}

export function Encabezado({ titulo, children, descripcion }) {
  return (
    <div className="encabezado-pagina">
      <div>
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {children && <div className="acciones-pagina">{children}</div>}
    </div>
  )
}

// Pestañas simples: [{ id, texto }]
export function Pestanas({ opciones, activa, onCambiar }) {
  return (
    <div className="pestanas" role="tablist">
      {opciones.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={activa === o.id} className={activa === o.id ? 'activa' : ''} onClick={() => onCambiar(o.id)}>
          {o.texto}
        </button>
      ))}
    </div>
  )
}
