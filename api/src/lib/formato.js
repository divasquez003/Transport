// Guatemala usa UTC-6 todo el año
const DESFASE = -6 * 60 * 60 * 1000

// Fecha y hora de Guatemala en formato MySQL: 2026-10-08 14:30:00
export function aHoraLocal(fecha) {
  return new Date(fecha.getTime() + DESFASE).toISOString().slice(0, 19).replace('T', ' ')
}

export function ahora() {
  return aHoraLocal(new Date())
}

export function hoy() {
  return ahora().slice(0, 10)
}

export function horaActual() {
  return Number(ahora().slice(11, 13))
}

export function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Opera sobre textos "AAAA-MM-DD HH:MM:SS" sin cambiar de zona horaria
const instante = (fechaHora) => new Date(`${fechaHora.replace(' ', 'T')}Z`).getTime()

export function sumarHoras(fechaHora, horas) {
  return new Date(instante(fechaHora) + horas * 3600000).toISOString().slice(0, 19).replace('T', ' ')
}

export function minutosEntre(desde, hasta) {
  return Math.round((instante(hasta) - instante(desde)) / 60000)
}

export function diasEntre(desde, hasta) {
  return Math.round((new Date(`${hasta}T00:00:00Z`) - new Date(`${desde}T00:00:00Z`)) / 86400000)
}

export function quetzales(monto) {
  return 'Q' + Number(monto).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function cantidad(valor) {
  return Number(valor).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// Unidades de medida del catálogo en singular y plural
const UNIDADES = {
  m2: ['m²', 'm²'], m3: ['m³', 'm³'], tonelada: ['tonelada', 'toneladas'], unidad: ['unidad', 'unidades'], saco: ['saco', 'sacos'],
  dia: ['día', 'días'], viaje: ['viaje', 'viajes'], contrato: ['contrato', 'contratos'], proyecto: ['proyecto', 'proyectos']
}

// conUnidad(95, 'tonelada') => "95 toneladas"; conUnidad(1, 'saco') => "1 saco"
export function conUnidad(valor, unidadMedida) {
  const [singular, plural] = UNIDADES[unidadMedida] ?? [unidadMedida ?? '', unidadMedida ?? '']
  return `${cantidad(valor)} ${Number(valor) === 1 ? singular : plural}`.trim()
}

// en_transito => en tránsito, en_ejecucion => en ejecución
const ACENTOS = { transito: 'tránsito', cotizacion: 'cotización', ejecucion: 'ejecución' }

export function estado(valor) {
  return String(valor).split('_').map((palabra) => ACENTOS[palabra] ?? palabra).join(' ')
}

// PED + año + id: PED-2026-00004
export function codigo(prefijo, id) {
  return `${prefijo}-${hoy().slice(0, 4)}-${String(id).padStart(5, '0')}`
}

export function redondear(numero) {
  return Math.round(Number(numero) * 100) / 100
}
