import { invalido } from './http.js'

// Reglas separadas por |  ejemplo: { nombre: 'requerido|texto|max:100', precio: 'numero|no_negativo' }
// Devuelve solo los campos enviados y válidos; si hay errores lanza 422 con el detalle por campo
export function validar(datos, reglas) {
  const fuente = datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {}
  const errores = {}
  const limpios = {}
  for (const [campo, regla] of Object.entries(reglas)) {
    let valor = fuente[campo]
    if (typeof valor === 'string') valor = valor.trim()
    const partes = regla.split('|')
    if (valor === undefined || valor === null || valor === '') {
      if (partes.includes('requerido')) errores[campo] = 'Es obligatorio'
      continue
    }
    for (const parte of partes) {
      const [nombre, argumento = ''] = parte.split(/:(.*)/s)
      const error = revisar(nombre, argumento, valor)
      if (error) {
        errores[campo] = error
        break
      }
    }
    if (!errores[campo]) limpios[campo] = convertir(partes, valor)
  }
  if (Object.keys(errores).length) throw invalido(errores)
  return limpios
}

function revisar(regla, argumento, valor) {
  switch (regla) {
    case 'requerido':
      return null
    case 'texto':
      return ['string', 'number'].includes(typeof valor) ? null : 'Debe ser texto'
    case 'entero':
      return /^-?\d+$/.test(String(valor)) ? null : 'Debe ser un número entero'
    case 'numero':
      return valor !== '' && Number.isFinite(Number(valor)) && typeof valor !== 'boolean' ? null : 'Debe ser un número'
    case 'positivo':
      return Number(valor) > 0 ? null : 'Debe ser mayor que cero'
    case 'no_negativo':
      return Number(valor) >= 0 ? null : 'No puede ser negativo'
    case 'correo':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor)) ? null : 'Correo electrónico no válido'
    case 'url':
      return /^https?:\/\/\S+$/i.test(String(valor)) ? null : 'Debe ser una URL http o https'
    case 'min':
      return String(valor).length >= Number(argumento) ? null : `Debe tener al menos ${argumento} caracteres`
    case 'max':
      return String(valor).length <= Number(argumento) ? null : `Debe tener como máximo ${argumento} caracteres`
    case 'hasta':
      return Number(valor) <= Number(argumento) ? null : `No puede ser mayor que ${argumento}`
    case 'en':
      return argumento.split(',').includes(String(valor)) ? null : `Valor no permitido; use: ${argumento.split(',').join(', ')}`
    case 'fecha':
      return fecha(String(valor)) ? null : 'Fecha no válida (formato AAAA-MM-DD)'
    case 'fechahora':
      return fechaHora(String(valor)) ? null : 'Fecha y hora no válidas (formato AAAA-MM-DD HH:MM)'
    case 'arreglo':
      return Array.isArray(valor) && valor.length ? null : 'Debe ser una lista con al menos un elemento'
    case 'booleano':
      return [true, false, 0, 1, '0', '1', 'true', 'false'].includes(valor) ? null : 'Debe ser true o false'
    case 'objeto':
      return valor && typeof valor === 'object' && !Array.isArray(valor) ? null : 'Debe ser un objeto'
    default:
      throw new Error(`Regla de validación desconocida: ${regla}`)
  }
}

function convertir(partes, valor) {
  if (partes.includes('entero')) return Number.parseInt(valor, 10)
  if (partes.includes('numero')) return Math.round(Number(valor) * 100) / 100
  if (partes.includes('booleano')) return [true, 1, '1', 'true'].includes(valor)
  if (partes.includes('fechahora')) return fechaHora(String(valor))
  return valor
}

export function fecha(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null
  const d = new Date(`${texto}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto ? texto : null
}

// Acepta "2026-10-08 10:00", "2026-10-08 10:00:00" y el formato de <input type="datetime-local">
export function fechaHora(texto) {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texto)
  if (!m || !fecha(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4] ?? 0) > 59) return null
  return `${m[1]} ${m[2]}:${m[3]}:${m[4] ?? '00'}`
}

// [{producto_id, cantidad}, ...] => Map(producto_id => cantidad); suma los productos repetidos
export function validarItems(items) {
  if (!Array.isArray(items) || !items.length) {
    throw invalido({ items: 'Debe ser una lista de objetos {producto_id, cantidad}' })
  }
  const resultado = new Map()
  items.forEach((item, i) => {
    const productoId = Number(item?.producto_id)
    const cantidad = Number(item?.cantidad)
    if (!Number.isInteger(productoId) || productoId < 1 || !Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1000000) {
      throw invalido({ [`items[${i}]`]: 'Cada elemento necesita producto_id (entero) y cantidad (mayor que cero)' })
    }
    resultado.set(productoId, Math.round(((resultado.get(productoId) ?? 0) + cantidad) * 100) / 100)
  })
  if (resultado.size > 50) throw invalido({ items: 'Máximo 50 productos distintos por pedido' })
  return resultado
}
