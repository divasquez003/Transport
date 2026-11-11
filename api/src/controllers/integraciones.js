import { createHash, randomBytes } from 'node:crypto'
import { aCsv } from '../lib/csv.js'
import { creado, enviarCsv, id, invalido, noEncontrado, ok, paginacion, paginado } from '../lib/http.js'
import { hoy, sumarDias } from '../lib/formato.js'
import { validar } from '../lib/validar.js'
import { giroDe } from '../middlewares/acceso.js'
import * as Clientes from '../models/clientes.js'
import * as Edi from '../models/edi.js'
import * as Integraciones from '../models/integraciones.js'
import * as Inventario from '../models/inventario.js'
import * as EdiService from '../services/edi.js'
import { EVENTOS } from '../services/webhooks.js'

export const PERMISOS_API = ['pedidos:leer', 'pedidos:crear', 'viajes:leer']

async function clienteActivo(clienteId) {
  const cliente = await Clientes.basico(clienteId)
  if (!cliente?.activo) throw invalido({ cliente_id: 'El cliente no existe o está inactivo' })
  return cliente
}

// ------------------------------------------------------------------ API keys de clientes

export async function listarClaves(req, res) {
  ok(res, await Integraciones.listarClaves())
}

// La clave completa solo se muestra al crearla; en la base de datos se guarda su hash SHA-256
export async function crearClave(req, res) {
  const datos = validar(req.body, { cliente_id: 'requerido|entero', nombre: 'requerido|texto|max:100', permisos: 'requerido' })
  const cliente = await clienteActivo(datos.cliente_id)
  const permisos = (Array.isArray(datos.permisos) ? datos.permisos : String(datos.permisos).split(',')).map((p) => String(p).trim()).filter(Boolean)
  const invalidos = permisos.filter((p) => !PERMISOS_API.includes(p))
  if (!permisos.length || invalidos.length) throw invalido({ permisos: `Permisos válidos: ${PERMISOS_API.join(', ')}` })
  const clave = `tp_${randomBytes(24).toString('base64url')}`
  const nuevo = await Integraciones.crearClave({
    cliente_id: cliente.id,
    nombre: datos.nombre,
    prefijo: clave.slice(0, 10),
    clave_hash: createHash('sha256').update(clave).digest('hex'),
    permisos: [...new Set(permisos)].join(',')
  })
  creado(res, { id: nuevo, cliente: cliente.nombre, nombre: datos.nombre, permisos, clave, aviso: 'Guarde la clave ahora: no se volverá a mostrar' }, 'API key creada')
}

// ------------------------------------------------------------------ webhooks (avisos a sistemas de clientes)

export async function listarWebhooks(req, res) {
  ok(res, await Integraciones.listarWebhooks(), { eventos: EVENTOS })
}

export async function crearWebhook(req, res) {
  const datos = validar(req.body, { cliente_id: 'requerido|entero', url: 'requerido|url|max:255', evento: `requerido|en:${EVENTOS.join(',')}` })
  const cliente = await clienteActivo(datos.cliente_id)
  const secreto = randomBytes(16).toString('hex')
  const nuevo = await Integraciones.crearWebhook({ ...datos, secreto })
  creado(res, {
    id: nuevo,
    cliente: cliente.nombre,
    url: datos.url,
    evento: datos.evento,
    secreto,
    aviso: 'Cada envío lleva el encabezado X-TransPort-Firma: sha256=HMAC(cuerpo, secreto)'
  }, 'Webhook registrado')
}

export async function eliminarWebhook(req, res) {
  const webhook = await Integraciones.buscarWebhook(id(req))
  if (!webhook) throw noEncontrado('Webhook')
  await Integraciones.eliminarWebhook(webhook.id)
  ok(res, { id: webhook.id, eliminado: true })
}

// ------------------------------------------------------------------ intercambio de archivos CSV (EDI)

// JSON { tipo, archivo, contenido } o el CSV directo (Content-Type: text/csv) con ?tipo=&archivo=
export async function importar(req, res) {
  const esTexto = typeof req.body === 'string'
  const fuente = esTexto ? { ...req.query, contenido: req.body } : { ...req.query, ...req.body }
  const datos = validar(fuente, {
    tipo: `requerido|en:${EdiService.TIPOS_IMPORTACION.join(',')}`,
    archivo: 'texto|max:80',
    contenido: 'requerido|texto|max:2000000'
  })
  const resultado = await EdiService.importar(req.usuario, { ...datos, archivo: datos.archivo ?? `${datos.tipo}.csv` })
  res.status(resultado.importados ? 201 : 422).json({
    ok: resultado.importados > 0,
    mensaje: `${resultado.importados} de ${resultado.filas} filas importadas`,
    data: resultado
  })
}

const EXPORTACIONES = {
  pedidos: {
    datos: Edi.pedidosConDetalle,
    columnas: ['pedido', 'fecha', 'nit', 'cliente', 'giro', 'estado', 'codigo_producto', 'producto', 'unidad_medida', 'cantidad', 'precio_unitario', 'subtotal', 'total_pedido', 'fecha_entrega', 'direccion_entrega']
  },
  viajes: {
    datos: Edi.viajes,
    columnas: ['viaje', 'estado', 'tipo_ruta', 'origen', 'destino', 'placa', 'nit', 'cliente', 'pedido', 'pedido_interno', 'carga_descripcion', 'peso_ton', 'salida_programada', 'salida_real', 'llegada_real', 'tarifa']
  },
  inventario: {
    datos: (f) => Inventario.existencias({ giro_id: f.giro_id }),
    columnas: ['sede_id', 'sede', 'codigo', 'producto', 'unidad_medida', 'cantidad', 'minimo']
  },
  movimientos: {
    datos: Edi.movimientos,
    columnas: ['fecha', 'sede_id', 'sede', 'codigo_producto', 'producto', 'unidad_medida', 'tipo', 'cantidad', 'referencia']
  }
}

// ?tipo=pedidos|viajes|inventario|movimientos&desde=&hasta= (por defecto, los últimos 30 días)
export async function exportar(req, res) {
  const f = validar(req.query, {
    tipo: `requerido|en:${Object.keys(EXPORTACIONES).join(',')}`,
    desde: 'fecha',
    hasta: 'fecha',
    giro_id: 'entero',
    cliente_id: 'entero',
    estado: 'texto|max:20'
  })
  f.hasta ??= hoy()
  f.desde ??= sumarDias(f.hasta, -30)
  if (f.desde > f.hasta) throw invalido({ desde: 'Debe ser anterior o igual a hasta' })
  f.giro_id = giroDe(req.usuario, f.giro_id)
  const { datos, columnas } = EXPORTACIONES[f.tipo]
  const filas = await datos(f)
  const archivo = `${f.tipo}_${f.desde}_${f.hasta}.csv`
  await Integraciones.bitacora({
    cliente_id: f.cliente_id,
    tipo: 'edi_exportacion',
    referencia: archivo,
    estado: 'exitoso',
    detalle: `${filas.length} filas exportadas por ${req.usuario.nombre}`
  })
  enviarCsv(res, archivo, aCsv(filas, columnas.map((c) => ({ titulo: c, campo: c }))))
}

// ------------------------------------------------------------------ bitácora de integraciones

export async function bitacora(req, res) {
  const f = validar(req.query, {
    tipo: 'en:api_entrada,webhook_salida,edi_importacion,edi_exportacion,gps',
    estado: 'en:exitoso,fallido',
    cliente_id: 'entero'
  })
  const pag = paginacion(req.query, 30)
  const [filas, total] = await Integraciones.listarBitacora(f, pag)
  paginado(res, filas, total, pag)
}
