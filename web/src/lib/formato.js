// Formatos para Guatemala: quetzales, fechas dd/mm/aaaa y nombres de estados
const moneda = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', minimumFractionDigits: 2 })
const numeroFormato = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 2 })
const compacto = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 1 })

export const quetzales = (valor) => (valor === null || valor === undefined ? '—' : moneda.format(Number(valor)))
export const numero = (valor) => (valor === null || valor === undefined ? '—' : numeroFormato.format(Number(valor)))
// Q734.4 k, Q2.2 M, -Q11.8 k
export function quetzalesCorto(valor) {
  const n = Number(valor ?? 0)
  const abs = Math.abs(n)
  const texto = abs >= 1e6 ? `${compacto.format(abs / 1e6)} M` : abs >= 1e3 ? `${compacto.format(abs / 1e3)} k` : compacto.format(abs)
  return `${n < 0 ? '-' : ''}Q${texto}`
}

// Unidades de medida del catálogo
const UNIDAD = { m2: 'm²', m3: 'm³', dia: 'día' }
const PLURAL = { tonelada: 'toneladas', unidad: 'unidades', saco: 'sacos', dia: 'días', viaje: 'viajes', contrato: 'contratos', proyecto: 'proyectos' }
// unidad('m2') => m²; con la cantidad va en plural cuando no es 1: unidad('tonelada', 95) => toneladas
export const unidad = (u, cantidad) => (cantidad !== undefined && Number(cantidad) !== 1 && PLURAL[u]) || UNIDAD[u] || u

export const porcentaje = (valor) => (valor === null || valor === undefined ? '—' : `${numeroFormato.format(Number(valor))} %`)

// "2026-10-08" => "08/10/2026"
export function fecha(texto) {
  if (!texto) return '—'
  const [a, m, d] = String(texto).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// "2026-10-08 14:30:00" => "08/10/2026 14:30"
export const fechaHora = (texto) => (texto ? `${fecha(texto)} ${String(texto).slice(11, 16)}` : '—')
export const hora = (texto) => (texto ? String(texto).slice(11, 16) : '')

// Fecha y hora de Guatemala (UTC-6) en formato de la API
export function ahoraLocal() {
  return new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
}
export const hoy = () => ahoraLocal().slice(0, 10)
export function sumarDias(texto, dias) {
  const d = new Date(`${texto}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// "hace 5 min", "hace 3 h", "ayer"
export function haceCuanto(texto) {
  if (!texto) return ''
  const minutos = Math.round((Date.parse(`${ahoraLocal().replace(' ', 'T')}Z`) - Date.parse(`${String(texto).replace(' ', 'T')}Z`)) / 60000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  if (minutos < 24 * 60) return `hace ${Math.round(minutos / 60)} h`
  if (minutos < 48 * 60) return 'ayer'
  return fecha(texto)
}

const ACENTOS = { transito: 'tránsito', cotizacion: 'cotización', ejecucion: 'ejecución', energia: 'energía' }

// "en_transito" => "En tránsito"
export function etiqueta(valor) {
  if (!valor) return ''
  const texto = String(valor).split('_').map((p) => ACENTOS[p] ?? p).join(' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export const ROLES = {
  dueno: 'Dueño',
  admin_general: 'Administrador general',
  gerente: 'Gerente',
  administrativo: 'Administrativo',
  vendedor: 'Vendedor',
  operativo: 'Operativo',
  cliente: 'Cliente'
}

export const TIPOS_RUTA = {
  materia_prima: 'Materia prima',
  inter_puertos: 'Inter puertos',
  inter_fronteras: 'Inter fronteras',
  puerto_bodega: 'Puerto a bodega',
  bodega_puerto: 'Bodega a puerto',
  local: 'Local'
}
