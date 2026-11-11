import { createHash } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { HttpError } from '../lib/http.js'
import * as Integraciones from '../models/integraciones.js'
import * as Usuarios from '../models/usuarios.js'

export const PUBLICO = 'publico'
export const OPCIONAL = 'opcional'
export const AUTENTICADO = 'autenticado'

// Grupos de roles que se usan en routes.js
export const CENTRAL = ['dueno', 'admin_general']
export const GESTION = ['dueno', 'admin_general', 'gerente', 'administrativo']
export const PERSONAL = ['dueno', 'admin_general', 'gerente', 'administrativo', 'vendedor', 'operativo']
export const VENTAS = ['dueno', 'admin_general', 'gerente', 'administrativo', 'vendedor']
export const CLIENTES_Y_VENTAS = ['cliente', ...VENTAS]

export const esCentral = (u) => CENTRAL.includes(u?.rol)
export const esCliente = (u) => u?.rol === 'cliente'
export const esGestion = (u) => GESTION.includes(u?.rol)
export const esPersonal = (u) => PERSONAL.includes(u?.rol)

// La sede central ve todos los giros; el personal solo el suyo
export const puedeVerGiro = (u, giroId) => esCentral(u) || (u?.giro_id != null && Number(u.giro_id) === Number(giroId))

// null = sin restricción (sede central); si no, el giro del usuario
export const giroDe = (u, filtro) => (esCentral(u) ? (filtro ?? null) : u.giro_id)

export function acceso(regla) {
  return async (req, res, next) => {
    if (regla === PUBLICO) return next()
    const token = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') ?? '')?.[1]
    if (!token) {
      if (regla === OPCIONAL) return next()
      throw new HttpError(401, 'Debe iniciar sesión: falta el token (Authorization: Bearer ...)')
    }
    let datos
    try {
      datos = jwt.verify(token, config.jwt.secreto, { algorithms: ['HS256'] })
    } catch (error) {
      if (regla === OPCIONAL) return next()
      throw new HttpError(401, error.name === 'TokenExpiredError' ? 'La sesión expiró, inicie sesión de nuevo' : 'Token inválido')
    }
    // Se vuelve a leer el usuario para respetar cambios de rol o desactivaciones
    const usuario = await Usuarios.sesion(Number(datos.sub))
    if (!usuario) throw new HttpError(401, 'El usuario no existe o está desactivado')
    if (Array.isArray(regla) && !regla.includes(usuario.rol)) {
      throw new HttpError(403, 'Su rol no tiene permiso para esta acción')
    }
    req.usuario = usuario
    next()
  }
}

// Sistemas de terceros: encabezado X-API-Key con el permiso indicado
export function apiKey(permiso) {
  const verificar = async (req, res, next) => {
    const clave = req.get('X-API-Key')
    if (!clave) throw new HttpError(401, 'Falta el encabezado X-API-Key')
    const registro = await Integraciones.claveActiva(createHash('sha256').update(clave).digest('hex'))
    if (!registro) throw new HttpError(401, 'API key inválida o desactivada')
    const permisos = (registro.permisos ?? '').split(',').map((p) => p.trim())
    if (!permisos.includes(permiso)) throw new HttpError(403, `La API key no tiene el permiso ${permiso}`)
    await Integraciones.registrarUso(registro.id)
    req.integracion = registro
    next()
  }
  verificar.descripcion = `API key con permiso ${permiso}`
  return verificar
}

// GPS-Inversiones envía sus eventos con un token compartido
export function tokenGps(req, res, next) {
  if (req.get('X-GPS-Token') !== config.gpsToken) throw new HttpError(401, 'Token del servicio GPS inválido')
  next()
}
tokenGps.descripcion = 'Servicio GPS (X-GPS-Token)'
