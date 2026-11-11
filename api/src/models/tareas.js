import { consulta } from '../db.js'

// Consultas de las tareas programadas (jobs/index.js)

export function alquileresVencidos() {
  return consulta(
    `SELECT a.id, a.codigo, a.cliente_id, c.nombre AS cliente, a.fecha_fin, DATEDIFF(CURDATE(), a.fecha_fin) AS dias_atraso,
            m.giro_id, m.codigo AS maquina, m.tipo AS tipo_maquina, a.vendedor_id
     FROM alquileres a JOIN maquinas m ON m.id = a.maquina_id JOIN clientes c ON c.id = a.cliente_id
     WHERE a.estado = 'activo' AND a.fecha_fin < CURDATE()`
  )
}

export function entregasDeHoy() {
  return consulta(
    `SELECT a.id, a.codigo, c.nombre AS cliente, m.giro_id, m.codigo AS maquina, m.tipo AS tipo_maquina, a.vendedor_id
     FROM alquileres a JOIN maquinas m ON m.id = a.maquina_id JOIN clientes c ON c.id = a.cliente_id
     WHERE a.estado = 'reservado' AND a.fecha_inicio = CURDATE()`
  )
}

export function bajoMinimoPorGiro() {
  return consulta(
    `SELECT s.giro_id, COUNT(*) AS productos, GROUP_CONCAT(CONCAT(p.nombre, ' (', s.nombre, ')') ORDER BY s.id SEPARATOR ', ') AS detalle
     FROM existencias e JOIN sedes s ON s.id = e.sede_id JOIN productos p ON p.id = e.producto_id
     WHERE e.cantidad < e.minimo AND s.giro_id IS NOT NULL GROUP BY s.giro_id`
  )
}

export function proyectosVencidos() {
  return consulta(
    `SELECT id, codigo, nombre, giro_id, cliente_id, fecha_fin_estimada, avance_porcentaje FROM proyectos
     WHERE estado = 'en_ejecucion' AND fecha_fin_estimada < CURDATE()`
  )
}

export function reunionesDeManana() {
  return consulta(
    `SELECT r.id, r.asunto, r.fecha_hora, r.modalidad, r.lugar, r.enlace, r.cliente_id, c.nombre AS cliente, r.vendedor_id
     FROM reuniones r JOIN clientes c ON c.id = r.cliente_id
     WHERE r.estado = 'confirmada' AND DATE(r.fecha_hora) = CURDATE() + INTERVAL 1 DAY`
  )
}
