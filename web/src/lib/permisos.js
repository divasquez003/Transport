// Los mismos grupos de roles que usa la API (api/src/middlewares/acceso.js)
export const CENTRAL = ['dueno', 'admin_general']
export const GESTION = [...CENTRAL, 'gerente', 'administrativo']
export const VENTAS = [...GESTION, 'vendedor']
export const PERSONAL = [...VENTAS, 'operativo']

export const tiene = (usuario, roles) => roles.includes(usuario?.rol)
export const esCliente = (usuario) => usuario?.rol === 'cliente'
export const esCentral = (usuario) => tiene(usuario, CENTRAL)
export const esGestion = (usuario) => tiene(usuario, GESTION)
export const esPersonal = (usuario) => tiene(usuario, PERSONAL)

// La sede central participa en todos los giros; el personal solo en el suyo
export const delGiro = (usuario, ...codigos) => esCentral(usuario) || codigos.includes(usuario?.giro_codigo)
export const puedeVerGiro = (usuario, giroId) => esCentral(usuario) || Number(usuario?.giro_id) === Number(giroId)

// Ver el personal (para elegir vendedores, pilotos o responsables) lo permite la API a estos roles
export const puedeListarPersonal = (usuario) => tiene(usuario, ['dueno', 'admin_general', 'gerente'])
