// Configuración leída de las variables de entorno (.env en desarrollo, docker-compose en contenedores)
const entero = (valor, defecto) => Number.parseInt(valor ?? '', 10) || defecto

export const config = {
  nombre: 'TransPort API',
  version: '2.0.0',
  puerto: entero(process.env.PORT, 3000),
  debug: process.env.APP_DEBUG === '1',
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: entero(process.env.DB_PORT, 3306),
    database: process.env.DB_NAME ?? 'transport_db',
    user: process.env.DB_USER ?? 'transport_app',
    password: process.env.DB_PASS ?? 'TransPort_2026'
  },
  jwt: {
    secreto: process.env.JWT_SECRET ?? 'cambie-este-secreto',
    duracion: entero(process.env.JWT_TTL, 28800)
  },
  corsOrigen: process.env.CORS_ORIGEN ?? '*',
  push: {
    publica: process.env.VAPID_PUBLICA ?? '',
    privada: process.env.VAPID_PRIVADA ?? '',
    contacto: process.env.VAPID_CONTACTO ?? 'mailto:soporte@transport.test'
  },
  gpsToken: process.env.GPS_TOKEN ?? 'gps-demo-2026',
  tareas: process.env.TAREAS !== '0',
  // Horario normal de trabajo de la maquinaria (para alertas del GPS)
  horario: {
    inicio: entero(process.env.HORARIO_INICIO, 6),
    fin: entero(process.env.HORARIO_FIN, 19)
  }
}
