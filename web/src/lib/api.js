// Cliente de la API: agrega el token de sesión y convierte los errores en mensajes legibles
const CLAVE_TOKEN = 'transport_token'

export const leerToken = () => {
  try {
    return localStorage.getItem(CLAVE_TOKEN)
  } catch {
    return null
  }
}

export function guardarToken(token) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token)
    else localStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // modo privado sin almacenamiento: la sesión dura lo que dure la pestaña
  }
}

export class ErrorApi extends Error {
  constructor(estado, mensaje, errores, cuerpo = null) {
    super(mensaje)
    this.estado = estado
    this.errores = errores
    this.cuerpo = cuerpo
  }

  // "Datos no válidos. fecha entrega: No puede ser una fecha pasada"
  get detalle() {
    const campos = Object.entries(this.errores ?? {})
      .filter(([, texto]) => texto !== this.message)
      .map(([campo, texto]) => `${campo.replaceAll('_', ' ')}: ${texto}`)
    return campos.length ? `${this.message}. ${campos.join('. ')}` : this.message
  }
}

async function solicitar(ruta, { metodo = 'GET', cuerpo, encabezados = {} } = {}) {
  const opciones = { method: metodo, headers: { ...encabezados } }
  const token = leerToken()
  if (token) opciones.headers.Authorization = `Bearer ${token}`
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json'
    opciones.body = JSON.stringify(cuerpo)
  }
  try {
    return await fetch(`/api${ruta}`, opciones)
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor')
  }
}

// Devuelve el cuerpo completo { ok, data, paginacion, ... }
export async function api(ruta, opciones) {
  const respuesta = await solicitar(ruta, opciones)
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    // Sesión vencida o usuario desactivado: la aplicación vuelve al inicio de sesión
    if (respuesta.status === 401 && leerToken()) window.dispatchEvent(new Event('sesion-vencida'))
    throw new ErrorApi(respuesta.status, datos?.mensaje ?? `Error ${respuesta.status}`, datos?.errores, datos)
  }
  return datos
}

export const obtener = async (ruta) => (await api(ruta)).data
export const enviar = async (ruta, cuerpo, metodo = 'POST') => (await api(ruta, { metodo, cuerpo })).data

// Descarga un CSV de la API (reportes y exportación EDI) con el nombre que indique el servidor
export async function descargar(ruta) {
  const respuesta = await solicitar(ruta)
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => null)
    throw new ErrorApi(respuesta.status, datos?.mensaje ?? 'No se pudo descargar el archivo', datos?.errores)
  }
  const nombre = /filename="([^"]+)"/.exec(respuesta.headers.get('content-disposition') ?? '')?.[1] ?? 'transport.csv'
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(await respuesta.blob())
  enlace.download = nombre
  enlace.click()
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000)
  return nombre
}

// Arma "?a=1&b=2" omitiendo los valores vacíos
export function consulta(parametros) {
  const texto = new URLSearchParams(
    Object.entries(parametros).filter(([, valor]) => valor !== undefined && valor !== null && valor !== '' && valor !== false)
  ).toString()
  return texto ? `?${texto}` : ''
}
