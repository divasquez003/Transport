// Pruebas de punta a punta de la API de TransPort (los 107 endpoints)
// Uso: node pruebas/probar_api.mjs [http://localhost:3000]
// En Docker: docker compose exec api npm test
// Crea registros de prueba: para volver a los datos de demostración, recargue database/02_datos_demo.sql

import { createECDH, randomBytes } from 'node:crypto'

const BASE = (process.argv[2] ?? process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '')
const SUFIJO = Date.now().toString(36).slice(-5)
const usados = new Set()
let total = 0
let fallos = 0

// ------------------------------------------------------------------ utilidades

const hoy = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10)
const dia = (n) => new Date(Date.parse(`${hoy()}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

async function api(metodo, ruta, { token, cuerpo, headers = {} } = {}) {
  const opciones = { method: metodo, headers: { ...headers } }
  if (token) opciones.headers.Authorization = `Bearer ${token}`
  if (cuerpo !== undefined) {
    opciones.body = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
    opciones.headers['Content-Type'] ??= typeof cuerpo === 'string' ? 'text/csv' : 'application/json'
  }
  const respuesta = await fetch(BASE + ruta, opciones)
  usados.add(`${metodo} ${ruta.split('?')[0]}`)
  const tipo = respuesta.headers.get('content-type') ?? ''
  const body = tipo.includes('json') ? await respuesta.json() : await respuesta.text()
  return { estado: respuesta.status, body, data: body?.data, headers: respuesta.headers }
}

async function prueba(desc, metodo, ruta, esperado, opciones = {}) {
  const r = await api(metodo, ruta, opciones)
  total++
  if (r.estado === esperado) {
    console.log(`ok    [${r.estado}] ${metodo} ${ruta} - ${desc}`)
  } else {
    fallos++
    console.log(`FALLO [${r.estado} != ${esperado}] ${metodo} ${ruta} - ${desc}`)
    console.log(`        ${JSON.stringify(r.body).slice(0, 500)}`)
  }
  return r
}

function verificar(condicion, desc, detalle) {
  total++
  if (condicion) {
    console.log(`ok             ${desc}`)
  } else {
    fallos++
    console.log(`FALLO          ${desc}${detalle === undefined ? '' : `: ${JSON.stringify(detalle).slice(0, 300)}`}`)
  }
}

const seccion = (titulo) => console.log(`\n== ${titulo}`)

async function login(correo, password = 'Demo2026') {
  const r = await api('POST', '/api/auth/login', { cuerpo: { correo, password } })
  if (r.estado !== 200) throw new Error(`No se pudo iniciar sesión con ${correo}: ${JSON.stringify(r.body)}`)
  return r.data.token
}

async function existencia(token, sedeId, productoId) {
  const r = await api('GET', `/api/inventario?sede_id=${sedeId}&producto_id=${productoId}`, { token })
  return r.data?.[0]?.cantidad ?? 0
}

// ------------------------------------------------------------------ sesiones de prueba

const t = {}
const correos = {
  dueno: 'dueno@transport.test',
  admin: 'admin@transport.test',
  gMineria: 'gerente.mineria@transport.test',
  operador: 'operador.mineria@transport.test',
  gProceso: 'gerente.proceso@transport.test',
  vProceso: 'ventas.proceso@transport.test',
  aProceso: 'admin.proceso@transport.test',
  gMaquinaria: 'gerente.maquinaria@transport.test',
  gTransporte: 'gerente.transportemp@transport.test',
  piloto: 'piloto.transportemp@transport.test',
  pilotoLog: 'piloto.logistica@transport.test',
  gLogistica: 'gerente.logistica@transport.test',
  gConstruccion: 'gerente.construccion@transport.test',
  vConstruccion: 'ventas.construccion@transport.test',
  laura: 'laura@losaltos.test',
  jorge: 'jorge@elvolcan.test',
  andres: 'andres@vistahermosa.test',
  oscar: 'oscar@cementeranorte.test'
}

seccion('Sistema')
await prueba('inicio', 'GET', '/', 200)
let r = await prueba('salud de la API y de MySQL', 'GET', '/api/salud', 200)
verificar(r.data?.base_de_datos?.conectada === true, 'MySQL conectado', r.data?.base_de_datos)
verificar(r.data?.endpoints?.total === 107 && r.data?.endpoints?.avance === '100%', '107 endpoints al 100 %', r.data?.endpoints)
await prueba('ruta inexistente', 'GET', '/api/no-existe', 404)
r = await prueba('método no permitido', 'DELETE', '/api/giros', 405)
verificar(r.headers.get('allow') === 'GET', 'encabezado Allow', r.headers.get('allow'))
await prueba('id no numérico', 'GET', '/api/pedidos/abc', 404)
await prueba('JSON mal formado', 'POST', '/api/auth/login', 400, { cuerpo: '{"correo":', headers: { 'Content-Type': 'application/json' } })

seccion('Autenticación')
for (const [clave, correo] of Object.entries(correos)) t[clave] = await login(correo)
await prueba('login correcto', 'POST', '/api/auth/login', 200, { cuerpo: { correo: correos.gProceso, password: 'Demo2026' } })
await prueba('contraseña incorrecta', 'POST', '/api/auth/login', 401, { cuerpo: { correo: correos.gProceso, password: 'otra' } })
await prueba('login sin datos', 'POST', '/api/auth/login', 422, { cuerpo: {} })
const correoNuevo = `cliente.${SUFIJO}@prueba.test`
r = await prueba('registro de cliente', 'POST', '/api/auth/registro', 201, {
  cuerpo: { nombre: 'Cliente de Prueba', correo: correoNuevo, password: 'Prueba2026', telefono: '5555-0000', tipo: 'persona' }
})
const tNuevo = r.data?.token
verificar(r.data?.usuario?.rol === 'cliente' && r.data?.usuario?.cliente_id, 'el registro crea cliente y usuario', r.data?.usuario)
await prueba('correo duplicado', 'POST', '/api/auth/registro', 409, { cuerpo: { nombre: 'Otro', correo: correoNuevo, password: 'Prueba2026' } })
r = await prueba('perfil', 'GET', '/api/auth/perfil', 200, { token: t.gProceso })
verificar(r.data?.rol === 'gerente' && r.data?.giro_id === 2 && typeof r.data?.alertas_no_leidas === 'number', 'perfil con rol, giro y alertas', r.data)
await prueba('perfil sin token', 'GET', '/api/auth/perfil', 401)
await prueba('token inválido', 'GET', '/api/auth/perfil', 401, { token: 'abc.def.ghi' })
await prueba('cambiar contraseña', 'PUT', '/api/auth/password', 200, { token: tNuevo, cuerpo: { password_actual: 'Prueba2026', password_nueva: 'Nueva2026' } })
await prueba('contraseña actual incorrecta', 'PUT', '/api/auth/password', 422, { token: tNuevo, cuerpo: { password_actual: 'mala', password_nueva: 'Otra2026x' } })
r = await prueba('solicitar recuperación', 'POST', '/api/auth/recuperar', 200, { cuerpo: { correo: correoNuevo } })
const tokenRecuperacion = r.data?.token_desarrollo
verificar(Boolean(tokenRecuperacion), 'token de recuperación (APP_DEBUG=1)')
await prueba('correo no registrado responde igual', 'POST', '/api/auth/recuperar', 200, { cuerpo: { correo: 'nadie@prueba.test' } })
await prueba('restablecer contraseña', 'POST', '/api/auth/restablecer', 200, { cuerpo: { token: tokenRecuperacion, password_nueva: 'Final2026' } })
await prueba('el enlace es de un solo uso', 'POST', '/api/auth/restablecer', 400, { cuerpo: { token: tokenRecuperacion, password_nueva: 'Otra2026x' } })
await prueba('login con la nueva contraseña', 'POST', '/api/auth/login', 200, { cuerpo: { correo: correoNuevo, password: 'Final2026' } })

seccion('Usuarios y roles')
r = await prueba('personal (sede central)', 'GET', '/api/usuarios', 200, { token: t.admin })
verificar(r.data?.length >= 15 && r.data.every((u) => !u.cliente_id), 'solo personal, sin clientes', r.data?.length)
r = await prueba('personal del giro (gerente)', 'GET', '/api/usuarios?rol=vendedor', 200, { token: t.gProceso })
verificar(r.data?.length && r.data.every((u) => u.giro_id === 2 && u.rol === 'vendedor'), 'el gerente solo ve su giro', r.data)
await prueba('vendedor no puede listar personal', 'GET', '/api/usuarios', 403, { token: t.vProceso })
r = await prueba('roles', 'GET', '/api/roles', 200, { token: t.admin })
verificar(r.data?.length === 7, '7 roles', r.data?.length)
r = await prueba('crear vendedor', 'POST', '/api/usuarios', 201, {
  token: t.admin,
  cuerpo: { nombre: 'Vendedor de Prueba', correo: `vendedor.${SUFIJO}@transport.test`, password: 'Prueba2026', rol: 'vendedor', giro_id: 2, sede_id: 7 }
})
const usuarioNuevo = r.data?.id
await prueba('sede de otro giro', 'POST', '/api/usuarios', 422, {
  token: t.admin, cuerpo: { nombre: 'X', correo: `x.${SUFIJO}@transport.test`, password: 'Prueba2026', rol: 'vendedor', giro_id: 2, sede_id: 2 }
})
await prueba('gerente no crea usuarios', 'POST', '/api/usuarios', 403, { token: t.gProceso, cuerpo: {} })
r = await prueba('actualizar usuario', 'PUT', `/api/usuarios/${usuarioNuevo}`, 200, { token: t.admin, cuerpo: { telefono: '5500-9999', sede_id: 6 } })
verificar(r.data?.telefono === '5500-9999' && r.data?.sede_id === 6, 'datos actualizados', r.data)
await prueba('desactivar usuario', 'PATCH', `/api/usuarios/${usuarioNuevo}/estado`, 200, { token: t.admin, cuerpo: { activo: false } })
await prueba('usuario desactivado no inicia sesión', 'POST', '/api/auth/login', 403, { cuerpo: { correo: `vendedor.${SUFIJO}@transport.test`, password: 'Prueba2026' } })
await prueba('reactivar usuario', 'PATCH', `/api/usuarios/${usuarioNuevo}/estado`, 200, { token: t.admin, cuerpo: { activo: true } })
await prueba('no puede desactivarse a sí mismo', 'PATCH', '/api/usuarios/2/estado', 403, { token: t.admin, cuerpo: { activo: false } })

seccion('Giros de negocio y sedes')
r = await prueba('giros', 'GET', '/api/giros', 200)
verificar(r.data?.length === 6, '6 giros de negocio', r.data?.length)
r = await prueba('giro de maquinaria con máquinas', 'GET', '/api/giros/3', 200)
verificar(r.data?.sedes?.length === 4 && r.data?.catalogo?.length > 0 && r.data?.maquinas?.length > 0, 'sedes, catálogo y máquinas', r.data?.maquinas?.length)
await prueba('giro inexistente', 'GET', '/api/giros/99', 404)
r = await prueba('actualizar giro', 'PUT', '/api/giros/5', 200, { token: t.admin, cuerpo: { slogan: 'Conectamos puertos, fronteras y bodegas' } })
await prueba('gerente no edita giros', 'PUT', '/api/giros/5', 403, { token: t.gLogistica, cuerpo: { slogan: 'x' } })
r = await prueba('sedes de minería', 'GET', '/api/sedes?giro_id=1', 200)
verificar(r.data?.length === 4, '4 plantas de extracción', r.data?.length)
r = await prueba('sede pública', 'GET', '/api/sedes/6', 200)
verificar(r.data?.resumen === undefined, 'sin resumen interno para el público')
r = await prueba('sede con sesión de personal', 'GET', '/api/sedes/6', 200, { token: t.gProceso })
verificar(r.data?.resumen?.productos_bajo_minimo >= 0, 'con resumen para el personal', r.data?.resumen)
r = await prueba('crear sede', 'POST', '/api/sedes', 201, {
  token: t.admin, cuerpo: { giro_id: 5, nombre: `Bodega de prueba ${SUFIJO}`, tipo: 'bodega', departamento: 'Izabal', municipio: 'Puerto Barrios' }
})
const sedeNueva = r.data?.id
await prueba('sede sin giro', 'POST', '/api/sedes', 422, { token: t.admin, cuerpo: { nombre: 'X', tipo: 'bodega', departamento: 'Izabal' } })
await prueba('actualizar sede', 'PUT', `/api/sedes/${sedeNueva}`, 200, { token: t.admin, cuerpo: { telefono: '7948-0000' } })

seccion('Productos y servicios')
r = await prueba('catálogo del giro de proceso', 'GET', '/api/productos?giro_id=2&por_pagina=5', 200)
verificar(r.body?.paginacion?.total >= 6 && r.data?.length === 5, 'paginado', r.body?.paginacion)
r = await prueba('búsqueda', 'GET', '/api/productos?buscar=porcelanato', 200)
verificar(r.data?.some((p) => p.codigo === 'PRO-002'), 'encuentra el porcelanato')
r = await prueba('detalle con disponibilidad por sede', 'GET', '/api/productos/7', 200)
verificar(r.data?.disponibilidad?.length > 0, 'disponibilidad por sede', r.data?.disponibilidad)
const codigoProducto = `PRB-${SUFIJO}`.toUpperCase()
r = await prueba('gerente crea producto de su giro', 'POST', '/api/productos', 201, {
  token: t.gProceso, cuerpo: { codigo: codigoProducto, nombre: 'Piso de prueba 60x60', tipo: 'producto', unidad_medida: 'm2', precio: 120 }
})
const productoNuevo = r.data?.id
verificar(r.data?.giro_id === 2, 'queda en el giro del gerente', r.data?.giro_id)
await prueba('código duplicado', 'POST', '/api/productos', 409, {
  token: t.gProceso, cuerpo: { codigo: codigoProducto, nombre: 'Otro', tipo: 'producto', unidad_medida: 'm2', precio: 1 }
})
await prueba('cliente no crea productos', 'POST', '/api/productos', 403, { token: t.laura, cuerpo: {} })
r = await prueba('actualizar precio', 'PUT', `/api/productos/${productoNuevo}`, 200, { token: t.gProceso, cuerpo: { precio: 125.5 } })
verificar(r.data?.precio === 125.5, 'precio actualizado', r.data?.precio)
await prueba('gerente de otro giro', 'PUT', `/api/productos/${productoNuevo}`, 403, { token: t.gMineria, cuerpo: { precio: 1 } })
await prueba('baja lógica', 'DELETE', `/api/productos/${productoNuevo}`, 200, { token: t.gProceso })
await prueba('ya no aparece en el catálogo público', 'GET', `/api/productos/${productoNuevo}`, 404)

seccion('Inventario')
r = await prueba('existencias bajo mínimo', 'GET', '/api/inventario?bajo_minimo=1', 200, { token: t.gProceso })
verificar(r.data?.length > 0 && r.data.every((e) => e.giro_id === 2 && e.bajo_minimo === true), 'solo su giro y bajo mínimo', r.data)
const pegamentoAntes = await existencia(t.gProceso, 6, 12)
r = await prueba('entrada de inventario', 'POST', '/api/inventario/movimientos', 201, {
  token: t.aProceso, cuerpo: { sede_id: 6, producto_id: 12, tipo: 'entrada', cantidad: 40, referencia: 'Compra de prueba' }
})
verificar(r.data?.existencia_nueva === pegamentoAntes + 40, 'existencia aumenta', r.data)
await prueba('salida mayor a la existencia', 'POST', '/api/inventario/movimientos', 409, {
  token: t.aProceso, cuerpo: { sede_id: 6, producto_id: 12, tipo: 'salida', cantidad: 999999 }
})
await prueba('los servicios no llevan inventario', 'POST', '/api/inventario/movimientos', 422, {
  token: t.gTransporte, cuerpo: { sede_id: 13, producto_id: 18, tipo: 'entrada', cantidad: 1 }
})
await prueba('sede de otro giro', 'POST', '/api/inventario/movimientos', 403, {
  token: t.aProceso, cuerpo: { sede_id: 2, producto_id: 1, tipo: 'entrada', cantidad: 1 }
})
r = await prueba('kardex de la sede', 'GET', '/api/inventario/movimientos?sede_id=6&producto_id=12', 200, { token: t.gProceso })
verificar(r.data?.[0]?.referencia === 'Compra de prueba', 'último movimiento registrado', r.data?.[0])

seccion('Clientes')
r = await prueba('clientes (vendedor)', 'GET', '/api/clientes?buscar=Los Altos', 200, { token: t.vProceso })
verificar(r.data?.[0]?.total_pedidos > 0, 'con total de pedidos', r.data?.[0])
await prueba('cliente no lista clientes', 'GET', '/api/clientes', 403, { token: t.laura })
r = await prueba('ficha propia del cliente', 'GET', '/api/clientes/1', 200, { token: t.laura })
verificar(Array.isArray(r.data?.resumen_por_giro) && r.data?.contactos?.length, 'resumen por giro y contactos', Object.keys(r.data ?? {}))
await prueba('ficha de otro cliente', 'GET', '/api/clientes/2', 404, { token: t.laura })
r = await prueba('vendedor registra cliente con acceso al portal', 'POST', '/api/clientes', 201, {
  token: t.vProceso,
  cuerpo: { nombre: `Ferretería Prueba ${SUFIJO}`, nit: `${SUFIJO}-K`, telefono: '7777-0000', contacto: { nombre: 'Encargado', correo: `ferreteria.${SUFIJO}@prueba.test`, password: 'Prueba2026' } }
})
verificar(r.data?.contactos?.length === 1, 'con un contacto', r.data?.contactos)
await prueba('NIT duplicado', 'POST', '/api/clientes', 409, { token: t.vProceso, cuerpo: { nombre: 'Otra', nit: `${SUFIJO}-K` } })
r = await prueba('el cliente actualiza su teléfono', 'PUT', '/api/clientes/1', 200, { token: t.laura, cuerpo: { telefono: '7761-1234' } })
await prueba('el cliente no cambia su nombre legal', 'PUT', '/api/clientes/1', 422, { token: t.laura, cuerpo: { nombre: 'Otro nombre' } })

seccion('Pedidos en línea')
r = await prueba('cliente hace un pedido', 'POST', '/api/pedidos', 201, {
  token: t.laura, cuerpo: { items: [{ producto_id: 7, cantidad: 50 }, { producto_id: 12, cantidad: 10 }], direccion_entrega: 'Obra zona 3, Xela', fecha_entrega: dia(5) }
})
const pedido = r.data
verificar(pedido?.estado === 'pendiente' && pedido?.total === 5030 && /^PED-\d{4}-\d{5}$/.test(pedido?.codigo), 'pendiente, total Q5,030 y código', pedido)
await prueba('producto por cotización', 'POST', '/api/pedidos', 422, { token: t.laura, cuerpo: { items: [{ producto_id: 25, cantidad: 1 }] } })
await prueba('productos de dos giros', 'POST', '/api/pedidos', 422, { token: t.laura, cuerpo: { items: [{ producto_id: 1, cantidad: 1 }, { producto_id: 7, cantidad: 1 }] } })
await prueba('alquiler como pedido', 'POST', '/api/pedidos', 422, { token: t.laura, cuerpo: { items: [{ producto_id: 13, cantidad: 1 }] } })
r = await prueba('vendedor registra pedido para un cliente', 'POST', '/api/pedidos', 201, { token: t.vProceso, cuerpo: { cliente_id: 1, items: [{ producto_id: 9, cantidad: 20 }] } })
const pedidoCancelable = r.data
verificar(pedidoCancelable?.vendedor_id === 7, 'queda asignado al vendedor', pedidoCancelable?.vendedor_id)
r = await prueba('pedidos del cliente', 'GET', '/api/pedidos', 200, { token: t.laura })
verificar(r.data?.length && r.data.every((p) => p.cliente_id === 1), 'solo sus pedidos', r.data?.map((p) => p.cliente_id))
r = await prueba('pedidos del giro (vendedor)', 'GET', '/api/pedidos?estado=pendiente', 200, { token: t.vProceso })
verificar(r.data?.every((p) => p.giro_id === 2 && p.estado === 'pendiente'), 'solo su giro y el estado pedido')
r = await prueba('mis pedidos (vendedor)', 'GET', '/api/pedidos?mios=1', 200, { token: t.vProceso })
verificar(r.data?.every((p) => p.vendedor_id === 7), 'solo los asignados al vendedor')
r = await prueba('detalle del pedido', 'GET', `/api/pedidos/${pedido.id}`, 200, { token: t.laura })
verificar(r.data?.detalle?.length === 2 && r.data?.historial?.length === 1, 'detalle e historial', r.data)
await prueba('pedido de otro cliente', 'GET', `/api/pedidos/${pedido.id}`, 404, { token: t.jorge })
await prueba('pedido de otro giro', 'GET', `/api/pedidos/${pedido.id}`, 403, { token: t.gMineria })
r = await prueba('asignar vendedor al pedido en línea', 'PATCH', `/api/pedidos/${pedido.id}/vendedor`, 200, { token: t.gProceso, cuerpo: { vendedor_id: 7 } })
verificar(r.data?.vendedor === 'Carlos Méndez', 'vendedor asignado', r.data?.vendedor)
await prueba('vendedor de otro giro', 'PATCH', `/api/pedidos/${pedido.id}/vendedor`, 422, { token: t.gProceso, cuerpo: { vendedor_id: 9 } })
await prueba('el mismo vendedor otra vez', 'PATCH', `/api/pedidos/${pedido.id}/vendedor`, 409, { token: t.gProceso, cuerpo: { vendedor_id: 7 } })
await prueba('el cliente no confirma pedidos', 'PATCH', `/api/pedidos/${pedido.id}/estado`, 403, { token: t.laura, cuerpo: { estado: 'confirmado' } })
await prueba('confirmar', 'PATCH', `/api/pedidos/${pedido.id}/estado`, 200, { token: t.gProceso, cuerpo: { estado: 'confirmado' } })
await prueba('salto de estado no permitido', 'PATCH', `/api/pedidos/${pedido.id}/estado`, 409, { token: t.gProceso, cuerpo: { estado: 'entregado' } })
await prueba('en proceso', 'PATCH', `/api/pedidos/${pedido.id}/estado`, 200, { token: t.gProceso, cuerpo: { estado: 'en_proceso' } })
const pisoAntes = await existencia(t.gProceso, 6, 7)
r = await prueba('despachar (descuenta inventario)', 'PATCH', `/api/pedidos/${pedido.id}/estado`, 200, { token: t.gProceso, cuerpo: { estado: 'despachado', sede_id: 6 } })
verificar(await existencia(t.gProceso, 6, 7) === pisoAntes - 50, 'existencia del piso baja 50 m²')
await prueba('entregado', 'PATCH', `/api/pedidos/${pedido.id}/estado`, 200, { token: t.vProceso, cuerpo: { estado: 'entregado', comentario: 'Recibido por el residente de obra' } })
await prueba('estado final', 'PATCH', `/api/pedidos/${pedido.id}/estado`, 409, { token: t.gProceso, cuerpo: { estado: 'cancelado', comentario: 'x' } })
await prueba('cancelar sin motivo', 'PATCH', `/api/pedidos/${pedidoCancelable.id}/estado`, 422, { token: t.laura, cuerpo: { estado: 'cancelado' } })
await prueba('el cliente cancela su pedido pendiente', 'PATCH', `/api/pedidos/${pedidoCancelable.id}/estado`, 200, { token: t.laura, cuerpo: { estado: 'cancelado', comentario: 'Cambio de proveedor' } })

seccion('Pedidos entre giros (abastecimiento)')
r = await prueba('la planta pide arcilla a minería', 'POST', '/api/pedidos-internos', 201, {
  token: t.gProceso, cuerpo: { giro_proveedor_id: 1, sede_solicitante_id: 6, fecha_requerida: dia(5), prioridad: 'alta', items: [{ producto_id: 4, cantidad: 50 }] }
})
const interno = r.data
verificar(interno?.estado === 'solicitado' && interno?.total === 4750, 'solicitado por Q4,750', interno)
await prueba('mismo giro como proveedor', 'POST', '/api/pedidos-internos', 422, {
  token: t.gProceso, cuerpo: { giro_proveedor_id: 2, fecha_requerida: dia(5), items: [{ producto_id: 7, cantidad: 1 }] }
})
r = await prueba('pedidos que debe atender minería', 'GET', '/api/pedidos-internos?rol=proveedor', 200, { token: t.gMineria })
verificar(r.data?.some((p) => p.id === interno.id), 'minería ve el pedido')
await prueba('detalle', 'GET', `/api/pedidos-internos/${interno.id}`, 200, { token: t.gMineria })
await prueba('giro que no participa', 'GET', `/api/pedidos-internos/${interno.id}`, 403, { token: t.gMaquinaria })
await prueba('el solicitante no puede aprobar', 'PATCH', `/api/pedidos-internos/${interno.id}/estado`, 403, { token: t.gProceso, cuerpo: { estado: 'aprobado' } })
await prueba('minería aprueba', 'PATCH', `/api/pedidos-internos/${interno.id}/estado`, 200, { token: t.gMineria, cuerpo: { estado: 'aprobado', comentario: 'Sale mañana de El Progreso' } })
const arcillaProgreso = await existencia(t.gMineria, 3, 4)
await prueba('despacho (sale de El Progreso)', 'PATCH', `/api/pedidos-internos/${interno.id}/estado`, 200, { token: t.gMineria, cuerpo: { estado: 'en_transito', sede_proveedora_id: 3 } })
verificar(await existencia(t.gMineria, 3, 4) === arcillaProgreso - 50, 'baja la arcilla en El Progreso')
const arcillaZacapa = await existencia(t.gProceso, 6, 4)
r = await prueba('la planta recibe (entra a Zacapa)', 'PATCH', `/api/pedidos-internos/${interno.id}/estado`, 200, { token: t.gProceso, cuerpo: { estado: 'recibido' } })
verificar(await existencia(t.gProceso, 6, 4) === arcillaZacapa + 50, 'sube la arcilla en Zacapa')
verificar(r.data?.historial?.length === 4, 'historial completo', r.data?.historial?.length)

seccion('Alertas, recordatorios y notificaciones')
r = await prueba('alertas del gerente de minería', 'GET', '/api/alertas', 200, { token: t.gMineria })
verificar(r.data?.some((a) => a.tipo === 'pedido_interno_nuevo' && a.entidad_id === interno.id), 'recibió la alerta del pedido interno')
verificar(typeof r.body?.no_leidas === 'number', 'conteo de no leídas', r.body?.no_leidas)
const alerta = r.data?.find((a) => !a.leida)
r = await prueba('marcar una como leída', 'PATCH', `/api/alertas/${alerta?.id}/leida`, 200, { token: t.gMineria })
await prueba('alerta de otro usuario', 'PATCH', `/api/alertas/${alerta?.id}/leida`, 404, { token: t.gProceso })
r = await prueba('marcar todas como leídas', 'PATCH', '/api/alertas/leidas', 200, { token: t.gMineria })
r = await prueba('solo no leídas', 'GET', '/api/alertas?no_leidas=1', 200, { token: t.gMineria })
verificar(r.data?.length === 0 && r.body?.no_leidas === 0, 'no quedan pendientes', r.body?.no_leidas)
r = await prueba('programar recordatorio', 'POST', '/api/recordatorios', 201, {
  token: t.gProceso, cuerpo: { titulo: 'Revisar orden de producción', fecha_hora: `${dia(1)} 08:30`, repeticion: 'semanal' }
})
const recordatorio = r.data?.id
await prueba('recordatorio en el pasado', 'POST', '/api/recordatorios', 422, { token: t.gProceso, cuerpo: { titulo: 'x', fecha_hora: `${dia(-1)} 08:00` } })
r = await prueba('mis recordatorios', 'GET', '/api/recordatorios?pendientes=1', 200, { token: t.gProceso })
verificar(r.data?.some((x) => x.id === recordatorio), 'aparece el recordatorio')
await prueba('recordatorio de otro usuario', 'DELETE', `/api/recordatorios/${recordatorio}`, 404, { token: t.gMineria })
await prueba('eliminar recordatorio', 'DELETE', `/api/recordatorios/${recordatorio}`, 200, { token: t.gProceso })
r = await prueba('llave pública VAPID', 'GET', '/api/notificaciones/clave-publica', 200)
verificar(r.data?.habilitado === true && r.data?.clave_publica?.length > 80, 'push habilitado', r.data)
const llaves = createECDH('prime256v1')
llaves.generateKeys()
await prueba('suscripción push del navegador', 'POST', '/api/notificaciones/suscripcion', 201, {
  token: tNuevo,
  cuerpo: { endpoint: `https://push.prueba.invalid/${SUFIJO}`, keys: { p256dh: llaves.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }
})
await prueba('suscripción incompleta', 'POST', '/api/notificaciones/suscripcion', 422, { token: tNuevo, cuerpo: { endpoint: 'https://x.test' } })

seccion('Reuniones con vendedores')
r = await prueba('el cliente pide reunión para cotizar', 'POST', '/api/reuniones', 201, {
  token: t.andres, cuerpo: { producto_id: 25, asunto: 'Bodega industrial de 2,000 m²', fecha_hora: `${dia(6)} 10:00`, modalidad: 'videoconferencia' }
})
const reunion = r.data
verificar(reunion?.estado === 'solicitada' && reunion?.giro_id === 6, 'solicitada al giro de construcción', reunion)
await prueba('fecha pasada', 'POST', '/api/reuniones', 422, { token: t.andres, cuerpo: { giro_id: 6, asunto: 'x', fecha_hora: `${dia(-2)} 10:00` } })
r = await prueba('el vendedor agenda directamente', 'POST', '/api/reuniones', 201, {
  token: t.vConstruccion, cuerpo: { cliente_id: 1, giro_id: 6, asunto: 'Ampliación de puente', fecha_hora: `${dia(8)} 15:00` }
})
const reunionVendedor = r.data
verificar(reunionVendedor?.estado === 'confirmada' && reunionVendedor?.vendedor_id === 13, 'confirmada con el vendedor', reunionVendedor)
r = await prueba('reuniones del cliente', 'GET', '/api/reuniones', 200, { token: t.andres })
verificar(r.data?.every((x) => x.cliente_id === 3), 'solo las suyas')
await prueba('detalle', 'GET', `/api/reuniones/${reunion.id}`, 200, { token: t.gConstruccion })
await prueba('giro distinto', 'GET', `/api/reuniones/${reunion.id}`, 403, { token: t.gProceso })
await prueba('vendedor de otro giro', 'PATCH', `/api/reuniones/${reunion.id}/asignar`, 422, { token: t.gConstruccion, cuerpo: { vendedor_id: 7 } })
r = await prueba('el gerente asigna vendedor', 'PATCH', `/api/reuniones/${reunion.id}/asignar`, 200, {
  token: t.gConstruccion, cuerpo: { vendedor_id: 13, enlace: 'https://meet.transport.test/bodega' }
})
verificar(r.data?.estado === 'confirmada' && r.data?.vendedor === 'Luis Alvarado', 'confirmada con Luis Alvarado', r.data)
r = await prueba('reuniones asignadas al vendedor', 'GET', '/api/reuniones?mias=1', 200, { token: t.vConstruccion })
verificar(r.data?.some((x) => x.id === reunion.id), 'el vendedor la ve')
await prueba('el vendedor la marca realizada', 'PATCH', `/api/reuniones/${reunion.id}/estado`, 200, { token: t.vConstruccion, cuerpo: { estado: 'realizada', notas: 'Se enviará cotización' } })
await prueba('una reunión realizada no se cancela', 'PATCH', `/api/reuniones/${reunion.id}/estado`, 409, { token: t.andres, cuerpo: { estado: 'cancelada', notas: 'x' } })
await prueba('el cliente cancela', 'PATCH', `/api/reuniones/${reunionVendedor.id}/estado`, 200, { token: t.laura, cuerpo: { estado: 'cancelada', notas: 'Se pospone el proyecto' } })

seccion('Mensajería cliente - empresa')
r = await prueba('el cliente escribe al giro de proceso', 'POST', '/api/conversaciones', 201, {
  token: t.laura, cuerpo: { giro_id: 2, asunto: `Consulta ${SUFIJO}`, mensaje: '¿Tienen porcelanato gris para 300 m²?' }
})
const conversacion = r.data
verificar(conversacion?.mensajes?.length === 1, 'con el primer mensaje')
r = await prueba('bandeja del vendedor', 'GET', '/api/conversaciones', 200, { token: t.vProceso })
verificar(r.data?.find((c) => c.id === conversacion.id)?.no_leidos === 1, 'un mensaje sin leer', r.data?.find((c) => c.id === conversacion.id))
r = await prueba('el vendedor abre la conversación', 'GET', `/api/conversaciones/${conversacion.id}/mensajes`, 200, { token: t.vProceso })
verificar(r.data?.mensajes?.[0]?.es_cliente === true, 'mensaje del cliente')
await prueba('otro giro no la ve', 'GET', `/api/conversaciones/${conversacion.id}/mensajes`, 403, { token: t.gMineria })
await prueba('el vendedor responde', 'POST', `/api/conversaciones/${conversacion.id}/mensajes`, 201, { token: t.vProceso, cuerpo: { contenido: 'Sí, hay 3,100 m² en Zacapa.' } })
r = await prueba('bandeja del cliente', 'GET', '/api/conversaciones', 200, { token: t.laura })
verificar(r.data?.find((c) => c.id === conversacion.id)?.no_leidos === 1, 'el cliente tiene la respuesta sin leer')
await prueba('el cliente no cierra conversaciones', 'POST', `/api/conversaciones/${conversacion.id}/mensajes`, 403, { token: t.laura, cuerpo: { contenido: 'Gracias', cerrar: true } })
r = await prueba('el vendedor responde y cierra', 'POST', `/api/conversaciones/${conversacion.id}/mensajes`, 201, { token: t.vProceso, cuerpo: { contenido: 'Quedamos atentos.', cerrar: true } })
verificar(r.data?.estado_conversacion === 'cerrada', 'conversación cerrada')

seccion('Maquinaria: venta y alquiler')
r = await prueba('catálogo público de maquinaria', 'GET', '/api/maquinas', 200)
verificar(r.data?.length >= 6 && r.data.every((m) => m.gps_dispositivo_id === undefined && m.estado !== 'vendida'), 'sin datos internos ni vendidas')
r = await prueba('disponibles en unas fechas', 'GET', `/api/maquinas?fecha_inicio=${dia(1)}&fecha_fin=${dia(3)}`, 200)
verificar(r.data?.every((m) => typeof m.disponible_en_fechas === 'boolean'), 'indica disponibilidad')
const codigoMaquina = `MQ-PRB-${SUFIJO}`.toUpperCase()
r = await prueba('registrar máquina', 'POST', '/api/maquinas', 201, {
  token: t.gMaquinaria, cuerpo: { codigo: codigoMaquina, tipo: 'Minicargador', marca: 'Bobcat', modelo: 'S70', anio: 2023, sede_id: 9, producto_id: 15, tarifa_diaria: 1200 }
})
const maquina = r.data
await prueba('código repetido', 'POST', '/api/maquinas', 409, { token: t.gMaquinaria, cuerpo: { codigo: codigoMaquina, tipo: 'X' } })
await prueba('el cliente no registra máquinas', 'POST', '/api/maquinas', 403, { token: t.laura, cuerpo: {} })
r = await prueba('ficha pública', 'GET', '/api/maquinas/2', 200)
verificar(r.data?.horometro === undefined && Array.isArray(r.data?.proximas_reservas), 'sin horómetro y con reservas')
r = await prueba('ficha para el personal', 'GET', '/api/maquinas/2', 200, { token: t.gMaquinaria })
verificar(r.data?.gps?.codigo_externo === 'GPSI-M-0045' && r.data?.alquiler_activo, 'con GPS y alquiler activo', r.data?.gps)
await prueba('actualizar tarifa', 'PUT', `/api/maquinas/${maquina.id}`, 200, { token: t.gMaquinaria, cuerpo: { tarifa_diaria: 1250 } })
await prueba('"alquilada" no se asigna a mano', 'PUT', `/api/maquinas/${maquina.id}`, 422, { token: t.gMaquinaria, cuerpo: { estado: 'alquilada' } })
const desplazamiento = 400 + Math.floor(Math.random() * 3000)
const [inicio, fin] = [dia(desplazamiento), dia(desplazamiento + 4)]
r = await prueba('disponibilidad y costo', 'GET', `/api/maquinas/${maquina.id}/disponibilidad?fecha_inicio=${inicio}&fecha_fin=${fin}`, 200)
verificar(r.data?.disponible === true && r.data?.dias === 5 && r.data?.total_estimado === 6250, '5 días por Q6,250', r.data)
r = await prueba('el cliente reserva', 'POST', '/api/alquileres', 201, { token: t.laura, cuerpo: { maquina_id: maquina.id, fecha_inicio: inicio, fecha_fin: fin } })
const alquiler = r.data
verificar(alquiler?.estado === 'reservado' && alquiler?.total === 6250, 'reservado por Q6,250', alquiler)
await prueba('fechas ocupadas', 'POST', '/api/alquileres', 409, { token: t.jorge, cuerpo: { maquina_id: maquina.id, fecha_inicio: dia(desplazamiento + 2), fecha_fin: dia(desplazamiento + 6) } })
await prueba('máquina en mantenimiento', 'POST', '/api/alquileres', 409, { token: t.jorge, cuerpo: { maquina_id: 5, fecha_inicio: dia(desplazamiento), fecha_fin: dia(desplazamiento + 1) } })
await prueba('fecha pasada', 'POST', '/api/alquileres', 422, { token: t.jorge, cuerpo: { maquina_id: maquina.id, fecha_inicio: dia(-3), fecha_fin: dia(-1) } })
r = await prueba('reserva para cancelar', 'POST', '/api/alquileres', 201, { token: t.jorge, cuerpo: { maquina_id: maquina.id, fecha_inicio: dia(desplazamiento + 10), fecha_fin: dia(desplazamiento + 11) } })
const alquilerCancelable = r.data
r = await prueba('alquileres del cliente', 'GET', '/api/alquileres', 200, { token: t.laura })
verificar(r.data?.every((a) => a.cliente_id === 1), 'solo los suyos')
r = await prueba('alquileres del giro', 'GET', '/api/alquileres?estado=reservado', 200, { token: t.gMaquinaria })
verificar(r.data?.some((a) => a.id === alquiler.id), 'el gerente ve la reserva')
await prueba('el cliente no entrega máquinas', 'PATCH', `/api/alquileres/${alquiler.id}/estado`, 403, { token: t.laura, cuerpo: { estado: 'activo' } })
await prueba('entrega de la máquina', 'PATCH', `/api/alquileres/${alquiler.id}/estado`, 200, { token: t.gMaquinaria, cuerpo: { estado: 'activo' } })
r = await api('GET', `/api/maquinas/${maquina.id}`, { token: t.gMaquinaria })
verificar(r.data?.estado === 'alquilada', 'la máquina queda alquilada', r.data?.estado)
r = await prueba('devolución con 2 días de atraso', 'PATCH', `/api/alquileres/${alquiler.id}/estado`, 200, { token: t.gMaquinaria, cuerpo: { estado: 'finalizado', fecha_devolucion: dia(desplazamiento + 6) } })
verificar(r.data?.total === 8750, 'se cobran 7 días: Q8,750', r.data?.total)
await prueba('el cliente cancela su reserva', 'PATCH', `/api/alquileres/${alquilerCancelable.id}/estado`, 200, { token: t.jorge, cuerpo: { estado: 'cancelado', comentario: 'Ya no se necesita' } })

seccion('Transporte: vehículos y viajes')
r = await prueba('flota del giro con posición', 'GET', '/api/vehiculos', 200, { token: t.gTransporte })
verificar(r.data?.length >= 2 && r.data.every((v) => v.giro_id === 4), 'solo su giro', r.data?.length)
verificar(r.data?.find((v) => v.id === 1)?.latitud != null, 'el camión en ruta tiene posición GPS')
const placa = `P-${SUFIJO}`.toUpperCase()
r = await prueba('registrar vehículo', 'POST', '/api/vehiculos', 201, { token: t.gLogistica, cuerpo: { placa, tipo: 'Cabezal', capacidad_ton: 28, sede_id: 14 } })
const vehiculo = r.data
await prueba('placa repetida', 'POST', '/api/vehiculos', 409, { token: t.gLogistica, cuerpo: { placa, tipo: 'Cabezal' } })
await prueba('actualizar vehículo', 'PUT', `/api/vehiculos/${vehiculo.id}`, 200, { token: t.gLogistica, cuerpo: { capacidad_ton: 30, velocidad_maxima_kmh: 70 } })
await prueba('vehículo en ruta no cambia de estado a mano', 'PUT', '/api/vehiculos/1', 409, { token: t.gTransporte, cuerpo: { estado: 'mantenimiento' } })
await prueba('vehículo de otro giro', 'PUT', `/api/vehiculos/${vehiculo.id}`, 403, { token: t.gTransporte, cuerpo: { capacidad_ton: 1 } })
const salida = `${dia(1)} 06:30`
r = await prueba('programar viaje', 'POST', '/api/viajes', 201, {
  token: t.gTransporte,
  cuerpo: { vehiculo_id: 3, piloto_id: 17, cliente_id: 4, tipo_ruta: 'materia_prima', origen: 'Planta de extracción Cobán', destino: 'Cementera del Norte, Cobán', carga_descripcion: 'Piedra caliza', peso_ton: 14, salida_programada: salida, tarifa: 2500 }
})
const viaje = r.data
verificar(/^VIA-\d{4}-\d{5}$/.test(viaje?.codigo) && viaje?.estado === 'programado', 'programado con código', viaje)
await prueba('ruta que no atiende el giro', 'POST', '/api/viajes', 422, {
  token: t.gTransporte, cuerpo: { vehiculo_id: 3, tipo_ruta: 'inter_puertos', origen: 'a', destino: 'b', salida_programada: salida }
})
await prueba('piloto de otro giro', 'POST', '/api/viajes', 422, {
  token: t.gTransporte, cuerpo: { vehiculo_id: 3, piloto_id: 19, tipo_ruta: 'materia_prima', origen: 'a', destino: 'b', salida_programada: salida }
})
await prueba('peso mayor a la capacidad', 'POST', '/api/viajes', 422, {
  token: t.gTransporte, cuerpo: { vehiculo_id: 3, tipo_ruta: 'materia_prima', origen: 'a', destino: 'b', salida_programada: salida, peso_ton: 40 }
})
r = await prueba('viajes del cliente', 'GET', '/api/viajes', 200, { token: t.oscar })
verificar(r.data?.length && r.data.every((v) => v.cliente_id === 4), 'solo los suyos', r.data?.map((v) => v.cliente_id))
r = await prueba('el giro solicitante ve el viaje de su pedido interno', 'GET', '/api/viajes?estado=en_ruta', 200, { token: t.gProceso })
verificar(r.data?.some((v) => v.id === 1), 'la planta ve el camión que trae su arcilla')
r = await prueba('seguimiento del viaje en ruta', 'GET', '/api/viajes/1', 200, { token: t.gTransporte })
verificar(r.data?.posicion?.latitud && r.data?.recorrido?.length >= 5, 'posición y recorrido GPS', r.data?.recorrido?.length)
await prueba('viaje ajeno para el cliente', 'GET', '/api/viajes/1', 404, { token: t.oscar })
await prueba('piloto de otro giro', 'PATCH', `/api/viajes/${viaje.id}/estado`, 403, { token: t.pilotoLog, cuerpo: { estado: 'en_ruta' } })
await prueba('el cliente no opera viajes', 'PATCH', `/api/viajes/${viaje.id}/estado`, 403, { token: t.oscar, cuerpo: { estado: 'en_ruta' } })
await prueba('el piloto inicia el viaje', 'PATCH', `/api/viajes/${viaje.id}/estado`, 200, { token: t.piloto, cuerpo: { estado: 'en_ruta' } })
r = await api('GET', '/api/vehiculos?estado=en_ruta', { token: t.gTransporte })
verificar(r.data?.some((v) => v.id === 3), 'el camión queda en ruta')
r = await prueba('el piloto entrega la carga', 'PATCH', `/api/viajes/${viaje.id}/estado`, 200, { token: t.piloto, cuerpo: { estado: 'entregado' } })
verificar(r.data?.llegada_real && r.data?.estado === 'entregado', 'con hora de llegada', r.data)

seccion('Producción: extracción y plantas de proceso')
const calizaAntes = await existencia(t.gMineria, 2, 1)
r = await prueba('el operador registra la extracción del turno', 'POST', '/api/produccion/extraccion', 201, { token: t.operador, cuerpo: { producto_id: 1, cantidad: 120, turno: 'diurno' } })
verificar(r.data?.sede_id === 2 && r.data?.existencia_nueva === calizaAntes + 120, 'entra al inventario de su planta', r.data)
await prueba('producto que no es materia prima', 'POST', '/api/produccion/extraccion', 422, { token: t.operador, cuerpo: { producto_id: 7, cantidad: 1 } })
await prueba('sede que no es de extracción', 'POST', '/api/produccion/extraccion', 422, { token: t.gProceso, cuerpo: { sede_id: 6, producto_id: 4, cantidad: 1 } })
r = await prueba('extracción con resumen', 'GET', `/api/produccion/extraccion?desde=${dia(-7)}`, 200, { token: t.gMineria })
verificar(r.body?.resumen?.length > 0 && r.body?.paginacion, 'resumen por materia prima', r.body?.resumen)
r = await prueba('orden de producción', 'POST', '/api/produccion/ordenes', 201, { token: t.gProceso, cuerpo: { sede_id: 6, producto_id: 8, cantidad_planificada: 1000 } })
const orden = r.data
verificar(/^OP-\d{4}-\d{5}$/.test(orden?.codigo) && orden?.estado === 'planificada', 'planificada', orden)
await prueba('producto que no fabrica la planta', 'POST', '/api/produccion/ordenes', 422, { token: t.gProceso, cuerpo: { sede_id: 6, producto_id: 4, cantidad_planificada: 1 } })
r = await prueba('órdenes del giro', 'GET', '/api/produccion/ordenes', 200, { token: t.vProceso })
verificar(r.data?.some((o) => o.id === orden.id), 'aparece la orden')
const porcelanatoAntes = await existencia(t.gProceso, 6, 8)
const feldespatoAntes = await existencia(t.gProceso, 6, 5)
r = await prueba('producción con consumo de materia prima', 'PATCH', `/api/produccion/ordenes/${orden.id}`, 200, {
  token: t.aProceso, cuerpo: { cantidad: 300, consumos: [{ producto_id: 5, cantidad: 2 }] }
})
verificar(r.data?.estado === 'en_proceso' && r.data?.cantidad_producida === 300, 'la orden inicia con 300 m²', r.data)
verificar(await existencia(t.gProceso, 6, 8) === porcelanatoAntes + 300, 'entra el porcelanato al inventario')
verificar(await existencia(t.gProceso, 6, 5) === feldespatoAntes - 2, 'sale el feldespato consumido')
await prueba('finalizar', 'PATCH', `/api/produccion/ordenes/${orden.id}`, 200, { token: t.gProceso, cuerpo: { estado: 'finalizada' } })
await prueba('orden finalizada', 'PATCH', `/api/produccion/ordenes/${orden.id}`, 409, { token: t.gProceso, cuerpo: { cantidad: 10 } })

seccion('Construcción: proyectos')
r = await prueba('proyectos del cliente', 'GET', '/api/proyectos', 200, { token: t.andres })
verificar(r.data?.length === 1 && r.data[0].situacion, 'su edificio, con situación del plazo', r.data?.[0])
r = await prueba('proyectos del giro', 'GET', '/api/proyectos?estado=en_ejecucion', 200, { token: t.gConstruccion })
verificar(r.data?.every((p) => p.estado === 'en_ejecucion' && p.avance_esperado != null), 'con avance esperado', r.data)
r = await prueba('registrar proyecto', 'POST', '/api/proyectos', 201, {
  token: t.gConstruccion,
  cuerpo: { cliente_id: 4, nombre: `Acceso planta ${SUFIJO}`, tipo: 'carretera', ubicacion: 'San Juan Chamelco', monto_contrato: 2500000, fecha_fin_estimada: dia(120) }
})
const proyecto = r.data
await prueba('proyecto de otro cliente', 'GET', `/api/proyectos/${proyecto.id}`, 404, { token: t.andres })
r = await prueba('ficha del proyecto', 'GET', '/api/proyectos/1', 200, { token: t.andres })
verificar(r.data?.avances?.length >= 3, 'con avances', r.data?.avances?.length)
await prueba('estado no permitido', 'PUT', `/api/proyectos/${proyecto.id}`, 409, { token: t.gConstruccion, cuerpo: { estado: 'finalizado' } })
r = await prueba('iniciar ejecución', 'PUT', `/api/proyectos/${proyecto.id}`, 200, { token: t.gConstruccion, cuerpo: { estado: 'en_ejecucion' } })
verificar(r.data?.fecha_inicio === hoy(), 'fecha de inicio = hoy', r.data?.fecha_inicio)
r = await prueba('registrar avance', 'POST', `/api/proyectos/${proyecto.id}/avances`, 201, { token: t.gConstruccion, cuerpo: { porcentaje: 25, descripcion: 'Terracería terminada' } })
verificar(r.data?.avance_porcentaje === 25, 'avance al 25 %', r.data?.avance_porcentaje)
await prueba('el avance no baja', 'POST', `/api/proyectos/${proyecto.id}/avances`, 422, { token: t.gConstruccion, cuerpo: { porcentaje: 10, descripcion: 'x' } })
await prueba('el cliente no registra avances', 'POST', `/api/proyectos/${proyecto.id}/avances`, 403, { token: t.oscar, cuerpo: { porcentaje: 30, descripcion: 'x' } })

seccion('Presupuesto y gastos')
r = await prueba('presupuesto del giro', 'GET', '/api/presupuestos', 200, { token: t.gTransporte })
verificar(r.data?.every((p) => p.giro_id === 4) && r.body?.resumen?.presupuesto > 0, 'solo su giro, con resumen', r.body?.resumen)
const [anio, mes] = [Number(hoy().slice(0, 4)), Number(hoy().slice(5, 7))]
const categoria = `prueba_${SUFIJO}`
r = await prueba('presupuesto por categoría', 'POST', '/api/presupuestos', 201, { token: t.admin, cuerpo: { giro_id: 4, anio, mes, categoria, monto: 1000 } })
verificar(r.data?.categoria === categoria && r.data?.monto === 1000, 'guardado', r.data)
await prueba('el gerente no fija presupuestos', 'POST', '/api/presupuestos', 403, { token: t.gTransporte, cuerpo: {} })
await prueba('gasto al 85 %', 'POST', '/api/gastos', 201, { token: t.gTransporte, cuerpo: { categoria, descripcion: 'Gasto de prueba', monto: 850 } })
r = await prueba('gasto que supera el presupuesto', 'POST', '/api/gastos', 201, { token: t.gTransporte, cuerpo: { categoria, descripcion: 'Otro gasto de prueba', monto: 200, documento: 'FAC-1' } })
verificar(r.data?.presupuesto_mes?.porcentaje > 0, 'devuelve la ejecución del mes', r.data?.presupuesto_mes)
r = await api('GET', '/api/alertas', { token: t.gTransporte })
verificar(r.data?.some((a) => a.tipo === 'presupuesto_80') && r.data?.some((a) => a.tipo === 'presupuesto_excedido'), 'alertas al 80 % y al 100 %')
await prueba('gasto con fecha futura', 'POST', '/api/gastos', 422, { token: t.gTransporte, cuerpo: { categoria, descripcion: 'x', monto: 1, fecha: dia(3) } })
r = await prueba('gastos por categoría', 'GET', `/api/gastos?categoria=${categoria}`, 200, { token: t.gTransporte })
verificar(r.data?.length === 2 && r.body?.total_monto === 1050, 'total Q1,050', r.body?.total_monto)

seccion('GPS (GPS-Inversiones)')
await prueba('sin token del servicio', 'POST', '/api/gps/eventos', 401, { cuerpo: { dispositivo: 'GPSI-T-0302', latitud: 14.6, longitud: -90.5 } })
r = await prueba('lote de eventos', 'POST', '/api/gps/eventos', 201, {
  headers: { 'X-GPS-Token': process.env.GPS_TOKEN ?? 'gps-demo-2026' },
  cuerpo: {
    eventos: [
      { dispositivo: 'GPSI-T-0302', latitud: 14.6421, longitud: -90.5133, velocidad_kmh: 97, motor_encendido: true },
      { dispositivo: 'GPSI-M-0032', latitud: 14.6012, longitud: -90.5521, velocidad_kmh: 4, motor_encendido: true, horas_uso: 6121.5 },
      { dispositivo: 'NO-EXISTE', latitud: 14.6, longitud: -90.5 }
    ]
  }
})
verificar(r.data?.recibidos === 2 && r.data?.rechazados?.length === 1, '2 recibidos y 1 rechazado', r.data)
console.log(`               alertas generadas: ${r.data?.alertas?.join(', ') || 'ninguna (ya se enviaron en los últimos minutos)'}`)
r = await prueba('dispositivos del giro de maquinaria', 'GET', '/api/gps/dispositivos', 200, { token: t.gMaquinaria })
verificar(r.data?.length === 2 && r.data.every((d) => d.tipo === 'maquinaria'), 'solo sus 2 máquinas con GPS', r.data?.length)
r = await prueba('última posición', 'GET', '/api/gps/dispositivos/3/posicion', 200, { token: t.gMaquinaria })
verificar(r.data?.minutos_desde_reporte <= 1 && r.data?.horas_uso === 6121.5, 'reporte reciente con horómetro', r.data)
await prueba('dispositivo de otro giro', 'GET', '/api/gps/dispositivos/1/posicion', 403, { token: t.gMaquinaria })
r = await prueba('recorrido del camión', 'GET', '/api/gps/dispositivos/1/recorrido', 200, { token: t.gTransporte })
verificar(r.data?.puntos?.length >= 5, 'puntos del recorrido', r.data?.puntos?.length)

seccion('Reportes')
r = await prueba('consolidado de la corporación', 'GET', '/api/reportes/consolidado', 200, { token: t.dueno })
verificar(r.data?.giros?.length === 6 && r.data?.totales?.ingresos > 0 && Array.isArray(r.data?.observaciones), '6 giros con totales y observaciones', r.data?.totales)
await prueba('el gerente no ve el consolidado', 'GET', '/api/reportes/consolidado', 403, { token: t.gProceso })
r = await prueba('reporte de su giro', 'GET', '/api/reportes/giros/2', 200, { token: t.gProceso })
verificar(r.data?.indicadores?.ventas > 0 && r.data?.ordenes_produccion, 'indicadores y órdenes de producción', r.data?.indicadores)
await prueba('reporte de otro giro', 'GET', '/api/reportes/giros/3', 403, { token: t.gProceso })
r = await prueba('utilización de maquinaria', 'GET', `/api/reportes/giros/3?desde=${dia(-180)}`, 200, { token: t.dueno })
verificar(r.data?.utilizacion_maquinas?.length >= 6, 'días alquilados por máquina', r.data?.utilizacion_maquinas?.[0])
r = await prueba('proyectos de construcción', 'GET', '/api/reportes/giros/6', 200, { token: t.gConstruccion })
verificar(r.data?.proyectos?.some((p) => p.situacion), 'proyectos con situación del plazo')
r = await prueba('ventas por producto', 'GET', `/api/reportes/ventas?agrupar=producto&desde=${dia(-180)}`, 200, { token: t.gProceso })
verificar(r.data?.length > 0 && r.body?.total > 0, 'ventas agrupadas', r.body?.total)
await prueba('agrupación no válida', 'GET', '/api/reportes/ventas?agrupar=color', 422, { token: t.gProceso })
r = await prueba('presupuesto anual', 'GET', '/api/reportes/presupuesto', 200, { token: t.admin })
verificar(r.data?.meses?.length >= 6 && r.data?.totales?.presupuesto > 0, 'meses y totales', r.data?.totales)
r = await prueba('estado del cliente', 'GET', '/api/reportes/clientes/1', 200, { token: t.laura })
verificar(r.data?.por_giro?.length > 0 && r.data?.total_pedidos > 0, 'compras por giro', r.data?.por_giro)
await prueba('reporte de otro cliente', 'GET', '/api/reportes/clientes/2', 404, { token: t.laura })
r = await prueba('exportar consolidado a CSV', 'GET', '/api/reportes/exportar?reporte=consolidado', 200, { token: t.dueno })
verificar(r.headers.get('content-type')?.startsWith('text/csv') && r.body.includes('Giro,Pedidos,Ventas'), 'archivo CSV para Excel')
await prueba('consolidado solo para la sede central', 'GET', '/api/reportes/exportar?reporte=consolidado', 403, { token: t.gProceso })
await prueba('exportar inventario', 'GET', '/api/reportes/exportar?reporte=inventario', 200, { token: t.gProceso })

seccion('Integraciones: API keys, webhooks y archivos CSV (EDI)')
r = await prueba('API keys', 'GET', '/api/integraciones/api-claves', 200, { token: t.admin })
verificar(r.data?.some((k) => k.prefijo === 'tp_demo') && r.data.every((k) => k.clave_hash === undefined), 'sin exponer el hash')
r = await prueba('nueva API key de solo lectura', 'POST', '/api/integraciones/api-claves', 201, { token: t.admin, cuerpo: { cliente_id: 4, nombre: 'ERP de prueba', permisos: ['pedidos:leer'] } })
const claveLectura = r.data?.clave
verificar(claveLectura?.startsWith('tp_'), 'la clave se muestra una sola vez')
await prueba('permiso desconocido', 'POST', '/api/integraciones/api-claves', 422, { token: t.admin, cuerpo: { cliente_id: 4, nombre: 'x', permisos: 'todo' } })
await prueba('solo la sede central', 'GET', '/api/integraciones/api-claves', 403, { token: t.gProceso })
r = await prueba('webhooks', 'GET', '/api/integraciones/webhooks', 200, { token: t.admin })
verificar(r.body?.eventos?.includes('viaje.entregado'), 'lista de eventos disponibles')
r = await prueba('registrar webhook', 'POST', '/api/integraciones/webhooks', 201, { token: t.admin, cuerpo: { cliente_id: 4, url: 'https://erp.prueba.invalid/hook', evento: 'pedido.creado' } })
const webhook = r.data
verificar(webhook?.secreto?.length === 32, 'secreto para firmar los envíos')
await prueba('evento desconocido', 'POST', '/api/integraciones/webhooks', 422, { token: t.admin, cuerpo: { cliente_id: 4, url: 'https://x.test', evento: 'otro' } })
await prueba('eliminar webhook', 'DELETE', `/api/integraciones/webhooks/${webhook.id}`, 200, { token: t.admin })
await prueba('webhook inexistente', 'DELETE', `/api/integraciones/webhooks/${webhook.id}`, 404, { token: t.admin })
const csvPedidos = [
  'referencia,nit,codigo_producto,cantidad,fecha_entrega',
  `OC-${SUFIJO}-1,4567812-3,PRO-001,30,${dia(4)}`,
  `OC-${SUFIJO}-1,4567812-3,PRO-006,5,${dia(4)}`,
  `OC-${SUFIJO}-2,4567812-3,NO-EXISTE,3,`
].join('\n')
r = await prueba('importar pedidos desde CSV', 'POST', '/api/integraciones/edi/importar', 201, { token: t.gProceso, cuerpo: { tipo: 'pedidos', archivo: 'ordenes_compra.csv', contenido: csvPedidos } })
verificar(r.data?.importados === 1 && r.data?.errores?.length === 1 && r.data?.creados?.[0]?.startsWith('PED-'), '1 pedido creado y 1 fila con error', r.data)
r = await prueba('importar conteo físico (text/csv)', 'POST', '/api/integraciones/edi/importar?tipo=inventario&archivo=conteo.csv', 201, {
  token: t.gProceso, cuerpo: 'sede_id;codigo_producto;cantidad\n6;PRO-006;1250\n'
})
verificar(r.data?.importados === 1 && await existencia(t.gProceso, 6, 12) === 1250, 'existencia ajustada a 1,250')
r = await prueba('importar gastos', 'POST', '/api/integraciones/edi/importar', 201, {
  token: t.gProceso, cuerpo: { tipo: 'gastos', contenido: `fecha,categoria,descripcion,monto,documento\n${hoy()},Energía,Factura eléctrica de prueba,"1,250.75",FAC-${SUFIJO}` }
})
verificar(r.data?.importados === 1, 'gasto importado', r.data)
await prueba('archivo sin columnas requeridas', 'POST', '/api/integraciones/edi/importar', 422, { token: t.gProceso, cuerpo: { tipo: 'pedidos', contenido: 'a,b\n1,2' } })
r = await prueba('exportar pedidos a CSV', 'GET', `/api/integraciones/edi/exportar?tipo=pedidos&desde=${dia(-30)}`, 200, { token: t.gProceso })
verificar(String(r.body).replace(/^\uFEFF/, '').startsWith('pedido,fecha,nit') && r.body.includes('PRO-001'), 'encabezado y líneas de pedido')
r = await prueba('bitácora de integraciones', 'GET', '/api/integraciones/bitacora?tipo=edi_importacion', 200, { token: t.admin })
verificar(r.data?.some((b) => b.referencia === 'pedidos: ordenes_compra.csv'), 'registra la importación')
await prueba('bitácora solo para la sede central', 'GET', '/api/integraciones/bitacora', 403, { token: t.gProceso })

seccion('API para sistemas de terceros (X-API-Key)')
const claveDemo = { 'X-API-Key': 'tp_demo_cementera_2026' }
await prueba('sin API key', 'GET', '/api/externo/pedidos', 401)
await prueba('API key inválida', 'GET', '/api/externo/pedidos', 401, { headers: { 'X-API-Key': 'tp_falsa' } })
r = await prueba('pedidos del cliente de la API key', 'GET', '/api/externo/pedidos', 200, { headers: claveDemo })
verificar(r.data?.every((p) => p.cliente_id === 4), 'solo de Cementera del Norte')
r = await prueba('pedido desde el sistema del cliente', 'POST', '/api/externo/pedidos', 201, {
  headers: claveDemo, cuerpo: { items: [{ codigo: 'MIN-001', cantidad: 28 }], direccion_entrega: 'Planta Cobán', observaciones: `Orden ERP ${SUFIJO}` }
})
verificar(r.data?.cliente_id === 4 && r.data?.total === 2380, 'pedido de 28 t de caliza por Q2,380', r.data)
await prueba('API key sin permiso de crear', 'POST', '/api/externo/pedidos', 403, { headers: { 'X-API-Key': claveLectura }, cuerpo: {} })
r = await prueba('seguimiento de un viaje propio', 'GET', `/api/externo/viajes/${viaje.id}`, 200, { headers: claveDemo })
verificar(r.data?.estado === 'entregado' && r.data?.piloto_telefono === undefined, 'sin datos internos del piloto', r.data)
await prueba('viaje de otro cliente', 'GET', '/api/externo/viajes/2', 404, { headers: claveDemo })
await prueba('API key sin permiso de viajes', 'GET', `/api/externo/viajes/${viaje.id}`, 403, { headers: { 'X-API-Key': claveLectura } })

// ------------------------------------------------------------------ cobertura y resumen

let cubiertos = null
try {
  const salud = await api('GET', '/api/salud')
  const { catalogo } = await import('../src/routes.js')
  const patron = (r) => new RegExp(`^${r.metodo} ${r.ruta.replaceAll(/\{\w+\}/g, '[^/]+')}$`)
  const faltan = catalogo.filter((r) => ![...usados].some((u) => patron(r).test(u)))
  cubiertos = catalogo.length - faltan.length
  console.log(`\nCobertura: ${cubiertos} de ${catalogo.length} endpoints (la API reporta ${salud.data?.endpoints?.total})`)
  for (const r of faltan) console.log(`  sin probar: ${r.metodo} ${r.ruta}`)
  if (faltan.length) fallos++
} catch (error) {
  console.log(`\n(No se pudo calcular la cobertura: ${error.message})`)
}

console.log(`\n${total - fallos} de ${total} verificaciones correctas${fallos ? `, ${fallos} fallos` : ''}`)
process.exit(fallos ? 1 : 0)
