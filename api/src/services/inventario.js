import { transaccion } from '../db.js'
import { conflicto } from '../lib/http.js'
import { cantidad, conUnidad, redondear } from '../lib/formato.js'
import * as Catalogo from '../models/catalogo.js'
import * as Inventario from '../models/inventario.js'
import * as AlertaService from './alertas.js'

// Registra un movimiento y actualiza la existencia de la sede.
// tipo: entrada (+), salida (-) o ajuste (la cantidad es el nuevo conteo físico)
export function mover({ sedeId, productoId, tipo, cantidad: valor, referencia, usuarioId }) {
  return transaccion(async () => {
    const actual = await Inventario.existenciaBloqueada(sedeId, productoId)
    const anterior = Number(actual?.cantidad ?? 0)
    const minimo = Number(actual?.minimo ?? 0)
    let nueva = anterior
    if (tipo === 'entrada') nueva = anterior + valor
    if (tipo === 'ajuste') nueva = valor
    if (tipo === 'salida') {
      if (valor > anterior) {
        const [sede, producto] = await Promise.all([Catalogo.buscarSede(sedeId), Catalogo.buscarProducto(productoId, true)])
        throw conflicto(`Existencia insuficiente de ${producto?.nombre ?? 'producto'} en ${sede?.nombre ?? 'la sede'}: hay ${conUnidad(anterior, producto?.unidad_medida)} y se necesitan ${cantidad(valor)}`)
      }
      nueva = anterior - valor
    }
    nueva = redondear(nueva)
    await Inventario.guardarExistencia(sedeId, productoId, nueva)
    await Inventario.registrarMovimiento({
      sede_id: sedeId,
      producto_id: productoId,
      tipo,
      cantidad: tipo === 'ajuste' ? redondear(nueva - anterior) : valor,
      referencia,
      usuario_id: usuarioId
    })
    // Alerta cuando la existencia baja del mínimo (solo la primera vez que lo cruza)
    if (minimo > 0 && nueva < minimo && anterior >= minimo) {
      const [sede, producto] = await Promise.all([Catalogo.buscarSede(sedeId), Catalogo.buscarProducto(productoId, true)])
      if (sede?.giro_id) {
        await AlertaService.aGiro(sede.giro_id, ['gerente', 'administrativo'], {
          tipo: 'stock_bajo',
          titulo: `Existencia baja: ${producto.nombre}`,
          mensaje: `${sede.nombre} tiene ${conUnidad(nueva, producto.unidad_medida)} (mínimo ${cantidad(minimo)}).`,
          prioridad: 'alta',
          entidad: 'producto',
          entidad_id: productoId
        })
      }
    }
    return { anterior, nueva }
  })
}
