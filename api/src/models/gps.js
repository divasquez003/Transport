import { consulta, donde, insertar, uno } from '../db.js'

// Cada dispositivo de GPS-Inversiones va en un camión o en una máquina
const COLUMNAS = `d.id, d.codigo_externo, d.tipo, d.descripcion, d.activo,
  v.id AS vehiculo_id, v.placa, v.velocidad_maxima_kmh, m.id AS maquina_id, m.codigo AS maquina, m.estado AS estado_maquina,
  COALESCE(v.giro_id, m.giro_id) AS giro_id, g.nombre AS giro,
  e.latitud, e.longitud, e.velocidad_kmh, e.motor_encendido, e.horas_uso, e.registrado_en`

const ORIGEN = `FROM gps_dispositivos d
  LEFT JOIN vehiculos v ON v.gps_dispositivo_id = d.id
  LEFT JOIN maquinas m ON m.gps_dispositivo_id = d.id
  LEFT JOIN giros_negocio g ON g.id = COALESCE(v.giro_id, m.giro_id)
  LEFT JOIN gps_eventos e ON e.id = (
    SELECT e2.id FROM gps_eventos e2 WHERE e2.dispositivo_id = d.id ORDER BY e2.registrado_en DESC, e2.id DESC LIMIT 1)`

export function listarDispositivos(f) {
  const filtro = donde([['COALESCE(v.giro_id, m.giro_id) = ?', f.giro_id], ['d.tipo = ?', f.tipo], ['d.activo = 1']])
  return consulta(`SELECT ${COLUMNAS} ${ORIGEN} ${filtro.sql} ORDER BY d.tipo, d.codigo_externo`, filtro.parametros)
}

export const buscarDispositivo = (id) => uno(`SELECT ${COLUMNAS} ${ORIGEN} WHERE d.id = ?`, [id])
export const dispositivoPorCodigo = (codigo) => uno(`SELECT ${COLUMNAS} ${ORIGEN} WHERE d.codigo_externo = ? AND d.activo = 1`, [codigo])

export function registrarEvento(e) {
  return insertar(
    `INSERT INTO gps_eventos (dispositivo_id, latitud, longitud, velocidad_kmh, motor_encendido, horas_uso, registrado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [e.dispositivo_id, e.latitud, e.longitud, e.velocidad_kmh ?? null, e.motor_encendido ?? null, e.horas_uso ?? null, e.registrado_en]
  )
}

export function recorrido(dispositivoId, desde, hasta) {
  return consulta(
    `SELECT latitud, longitud, velocidad_kmh, motor_encendido, horas_uso, registrado_en FROM gps_eventos
     WHERE dispositivo_id = ? AND registrado_en BETWEEN ? AND ? ORDER BY registrado_en, id LIMIT 1000`,
    [dispositivoId, desde, hasta]
  )
}

export function actualizarHorometro(maquinaId, horas) {
  return consulta('UPDATE maquinas SET horometro = GREATEST(COALESCE(horometro, 0), ?) WHERE id = ?', [horas, maquinaId])
}
