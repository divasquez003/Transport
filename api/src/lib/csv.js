// columnas: [{ titulo: 'Código', campo: 'codigo' }] o campo como función (fila) => valor
export function aCsv(filas, columnas) {
  const lineas = [columnas.map((c) => celda(c.titulo)).join(',')]
  for (const fila of filas) {
    lineas.push(columnas.map((c) => celda(typeof c.campo === 'function' ? c.campo(fila) : fila[c.campo])).join(','))
  }
  return lineas.join('\r\n')
}

function celda(valor) {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor)
  return /[",;\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto
}

// Lee un CSV con encabezado (separado por coma o por punto y coma, como lo guarda Excel en español)
export function leerCsv(texto) {
  const limpio = String(texto ?? '').replace(/^\uFEFF/, '')
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] ?? ''
  const separador = (primeraLinea.match(/;/g) ?? []).length > (primeraLinea.match(/,/g) ?? []).length ? ';' : ','
  const registros = []
  let fila = []
  let campo = ''
  let entreComillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (entreComillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') {
        entreComillas = false
      } else {
        campo += c
      }
    } else if (c === '"') {
      entreComillas = true
    } else if (c === separador) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++
      fila.push(campo)
      registros.push(fila)
      fila = []
      campo = ''
    } else {
      campo += c
    }
  }
  if (campo !== '' || fila.length) {
    fila.push(campo)
    registros.push(fila)
  }
  const [encabezado = [], ...datos] = registros.filter((r) => r.some((v) => v.trim() !== ''))
  const columnas = encabezado.map((c) => c.trim().toLowerCase())
  return datos.map((r) => Object.fromEntries(columnas.map((c, i) => [c, (r[i] ?? '').trim()])))
}
