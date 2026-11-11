// Simula el servicio de GPS-Inversiones: envía posiciones a POST /api/gps/eventos
// Uso: npm run simular-gps          (dentro del contenedor: docker compose exec api npm run simular-gps)
// Variables: API_URL (http://localhost:3000/api), GPS_TOKEN, INTERVALO_MS (3000)

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}/api`
const TOKEN = process.env.GPS_TOKEN ?? 'gps-demo-2026'
const INTERVALO = Number(process.env.INTERVALO_MS ?? 3000)

// Camión C-148BCD (viaje en ruta El Progreso -> Zacapa por la CA-9), desde Teculután hasta la planta
const RUTA = [
  [14.9890, -89.7160, 62], [14.9935, -89.6880, 68], [14.9978, -89.6590, 74], [15.0005, -89.6290, 95],
  [15.0012, -89.6010, 71], [15.0010, -89.5710, 52], [14.9905, -89.5520, 38], [14.9790, -89.5390, 22], [14.9720, -89.5300, 0]
]

const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function enviar(eventos) {
  const respuesta = await fetch(`${API}/gps/eventos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GPS-Token': TOKEN },
    body: JSON.stringify({ eventos })
  })
  const cuerpo = await respuesta.json()
  const alertas = cuerpo.data?.alertas?.length ? `  alertas: ${cuerpo.data.alertas.join(', ')}` : ''
  console.log(`HTTP ${respuesta.status}  ${cuerpo.mensaje}${alertas}`)
}

let horasExcavadora = 1834.5
console.log(`Enviando eventos a ${API} cada ${INTERVALO / 1000} s (Ctrl+C para detener)\n`)
for (const [i, [latitud, longitud, velocidad]] of RUTA.entries()) {
  horasExcavadora += 0.1
  const eventos = [
    { dispositivo: 'GPSI-T-0148', latitud, longitud, velocidad_kmh: velocidad, motor_encendido: velocidad > 0 },
    // Excavadora alquilada trabajando en la obra del cliente
    { dispositivo: 'GPSI-M-0045', latitud: 14.7765, longitud: -90.411, velocidad_kmh: 3, motor_encendido: true, horas_uso: Number(horasExcavadora.toFixed(1)) }
  ]
  // A media ruta, la retroexcavadora que debería estar en la sucursal enciende el motor
  if (i === 5) eventos.push({ dispositivo: 'GPSI-M-0032', latitud: 14.6031, longitud: -90.5498, velocidad_kmh: 6, motor_encendido: true, horas_uso: 6120.4 })
  console.log(`Punto ${i + 1}/${RUTA.length}: ${latitud}, ${longitud} a ${velocidad} km/h`)
  try {
    await enviar(eventos)
  } catch (error) {
    console.error(`No se pudo conectar con ${API}: ${error.cause?.code ?? error.message}`)
    process.exit(1)
  }
  if (i < RUTA.length - 1) await espera(INTERVALO)
}
console.log('\nEl camión llegó a la planta de Zacapa: marque el viaje como entregado en el portal.')
