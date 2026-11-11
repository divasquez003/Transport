import { useState } from 'react'

// Gráficas livianas en HTML/CSS. Colores validados para fondo blanco (paleta categórica: azul y naranja).
export const COLORES = { serie1: '#2a78d6', serie2: '#eb6834', positivo: '#2a78d6', negativo: '#e34948' }

const compacto = new Intl.NumberFormat('es-GT', { notation: 'compact', maximumFractionDigits: 1 })

// Marcas del eje: 0 y valores redondos hasta el máximo
function marcasEje(maximo) {
  if (maximo <= 0) return [0]
  const paso = 10 ** Math.floor(Math.log10(maximo / 3))
  const redondo = [1, 2, 2.5, 5, 10].map((m) => m * paso).find((p) => maximo / p <= 4) ?? paso * 10
  const marcas = [0]
  while (marcas.at(-1) < maximo) marcas.push(marcas.at(-1) + redondo)
  return marcas
}

// Tooltip: el valor es lo más visible; la etiqueta va después
function Tooltip({ visible, x, titulo, filas }) {
  if (!visible) return null
  return (
    <div className="tooltip-grafica" style={{ left: `${x}%` }} role="tooltip">
      <span className="tooltip-titulo">{titulo}</span>
      {filas.map((f) => (
        <span key={f.nombre} className="tooltip-fila">
          {f.color && <i className="clave-linea" style={{ background: f.color }} />}
          <strong>{f.valor}</strong> <span>{f.nombre}</span>
        </span>
      ))}
    </div>
  )
}

// Columnas de una sola serie (por ejemplo, ventas por mes). desglose(d) agrega filas al tooltip.
export function Columnas({ datos, valor, etiqueta, formato, desglose, nombreSerie, alto = 200 }) {
  const [activo, setActivo] = useState(null)
  const maximo = Math.max(0, ...datos.map(valor))
  const marcas = marcasEje(maximo)
  const tope = marcas.at(-1) || 1
  const actual = activo === null ? null : datos[activo]
  return (
    <div className="grafica">
      <div className="grafica-cuerpo" style={{ height: alto }} onMouseLeave={() => setActivo(null)}>
        <div className="eje-y" aria-hidden="true">
          {marcas.map((m) => <span key={m} style={{ bottom: `${(m / tope) * 100}%` }}>{compacto.format(m)}</span>)}
        </div>
        <div className="area-grafica">
          {marcas.map((m) => <div key={m} className="linea-guia" style={{ bottom: `${(m / tope) * 100}%` }} />)}
          <div className="columnas">
            {datos.map((d, i) => (
              <button
                key={etiqueta(d)}
                type="button"
                className={`columna${activo === i ? ' activa' : ''}`}
                onMouseEnter={() => setActivo(i)}
                onFocus={() => setActivo(i)}
                onBlur={() => setActivo(null)}
                aria-label={`${etiqueta(d)}: ${formato(valor(d))}`}
              >
                <span className="marca-columna" style={{ height: `${(valor(d) / tope) * 100}%`, background: COLORES.serie1 }} />
              </button>
            ))}
          </div>
          <Tooltip
            visible={actual !== null}
            x={activo === null ? 0 : ((activo + 0.5) / datos.length) * 100}
            titulo={actual ? etiqueta(actual) : ''}
            filas={actual ? [{ nombre: nombreSerie, valor: formato(valor(actual)) }, ...(desglose?.(actual) ?? [])] : []}
          />
        </div>
      </div>
      <div className="eje-x" aria-hidden="true">
        {datos.map((d) => <span key={etiqueta(d)}>{etiqueta(d)}</span>)}
      </div>
    </div>
  )
}

// Barras horizontales: una serie (valor al final de la barra) o dos series agrupadas (con leyenda)
export function Barras({ filas, series, etiqueta, formato }) {
  const [activo, setActivo] = useState(null)
  const maximo = Math.max(0, ...filas.flatMap((f) => series.map((s) => Number(f[s.campo]) || 0))) || 1
  const unaSerie = series.length === 1
  return (
    <div className="grafica">
      {!unaSerie && (
        <div className="leyenda">
          {series.map((s, i) => (
            <span key={s.campo}><i className="clave-caja" style={{ background: s.color ?? Object.values(COLORES)[i] }} />{s.nombre}</span>
          ))}
        </div>
      )}
      <div className="barras" onMouseLeave={() => setActivo(null)}>
        {filas.map((f, i) => (
          <div
            key={etiqueta(f)}
            className={`fila-barra${activo === i ? ' activa' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            onBlur={() => setActivo(null)}
            aria-label={`${etiqueta(f)}: ${series.map((s) => `${s.nombre} ${formato(f[s.campo])}`).join(', ')}`}
          >
            <span className="etiqueta-barra">{etiqueta(f)}</span>
            <span className="grupo-barras">
              {series.map((s, j) => {
                const v = Math.max(0, Number(f[s.campo]) || 0)
                return (
                  <span key={s.campo} className="pista-barra">
                    <span className="marca-barra" style={{ width: `${(v / maximo) * 100}%`, background: s.color ?? Object.values(COLORES)[j] }} />
                    {unaSerie && <span className="valor-barra">{formato(f[s.campo])}</span>}
                  </span>
                )
              })}
            </span>
            {!unaSerie && activo === i && (
              <span className="tooltip-grafica tooltip-fila-barra" role="tooltip">
                {series.map((s, j) => (
                  <span key={s.campo} className="tooltip-fila">
                    <i className="clave-linea" style={{ background: s.color ?? Object.values(COLORES)[j] }} />
                    <strong>{formato(f[s.campo])}</strong> <span>{s.nombre}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Barras divergentes desde cero: positivo hacia la derecha (azul) y negativo hacia la izquierda (rojo)
export function BarrasDivergentes({ filas, etiqueta, valor, formato }) {
  const maximo = Math.max(1, ...filas.map((f) => Math.abs(Number(valor(f)) || 0)))
  return (
    <div className="grafica">
      <div className="leyenda">
        <span><i className="clave-caja" style={{ background: COLORES.positivo }} />Positivo</span>
        <span><i className="clave-caja" style={{ background: COLORES.negativo }} />Negativo</span>
      </div>
      <div className="barras">
        {filas.map((f) => {
          const v = Number(valor(f)) || 0
          // La barra más larga ocupa 40 % del ancho: queda espacio para el valor al final
          const ancho = `${(Math.abs(v) / maximo) * 40}%`
          return (
            <div key={etiqueta(f)} className="fila-barra" tabIndex={0} aria-label={`${etiqueta(f)}: ${formato(v)}`}>
              <span className="etiqueta-barra">{etiqueta(f)}</span>
              <span className="pista-divergente">
                <span className="cero" />
                <span className={`marca-divergente ${v < 0 ? 'negativa' : 'positiva'}`} style={{ width: ancho, background: v < 0 ? COLORES.negativo : COLORES.positivo }} />
                <span className={`valor-divergente ${v < 0 ? 'negativa' : 'positiva'}`} style={{ [v < 0 ? 'right' : 'left']: `calc(50% + ${ancho} + 6px)` }}>{formato(v)}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Medidor de consumo (presupuesto): azul normal, amarillo desde 80 % y rojo desde 100 %, siempre con texto
export function Medidor({ porcentaje }) {
  const valor = Math.round((Number(porcentaje) || 0) * 10) / 10
  const nivel = valor >= 100 ? 'critico' : valor >= 80 ? 'aviso' : 'normal'
  const texto = { critico: 'excedido', aviso: 'cerca del límite', normal: '' }[nivel]
  return (
    <div className={`medidor medidor-${nivel}`}>
      <div className="pista-medidor" role="meter" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100} aria-label={`${valor} % ejecutado`}>
        <div className="relleno-medidor" style={{ width: `${Math.min(100, valor)}%` }} />
      </div>
      <span className="texto-medidor">{nivel !== 'normal' && <b aria-hidden="true">{nivel === 'critico' ? '⛔' : '⚠'} </b>}{valor.toLocaleString('es-GT')} %{texto && ` · ${texto}`}</span>
    </div>
  )
}
