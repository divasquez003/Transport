# TransPort · Proyecto Final de Desarrollo Web

Plataforma a la medida para TransPort: sitio web de ventas, portal de clientes y empleados (PWA) y API REST para los seis giros de negocio (extracción minera, procesamiento de materia prima, venta y alquiler de maquinaria, transporte de materia prima, transporte de productos y servicios de construcción).

| Parte | Tecnología | Dirección |
|---|---|---|
| Web y PWA | React 19 + Vite 8, React Router, Leaflet; servida por nginx | http://localhost:8090 |
| API REST | Node.js 22 + Express 5 + mysql2 (107 endpoints) | http://localhost:8091/api (y http://localhost:8090/api por el proxy de nginx) |
| Base de datos | MySQL 9.6, contenedor `mysql` (81d14f752082) | `transport_db` en el puerto 3306 |

`GET /api/salud` muestra el estado de la conexión a MySQL y los 107 endpoints implementados.

## Cómo levantarlo

Requisitos: Docker Desktop encendido y el contenedor de MySQL. Los comandos completos y comentados están en [`comandos.txt`](comandos.txt).

```powershell
# 1. Crear (o reiniciar) la base de datos en el contenedor de MySQL
docker start 81d14f752082
docker cp database/. 81d14f752082:/tmp/transport-db
docker exec 81d14f752082 sh -c 'cd /tmp/transport-db && for f in 01_esquema.sql 02_datos_demo.sql 03_usuario_app.sql; do MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql -uroot --default-character-set=utf8mb4 < $f || exit 1; done'

# 2. Construir y levantar la API y la web
docker compose up -d --build
```

La primera vez Docker descarga `node:22-alpine` y `nginx:alpine` y compila la web (unos minutos). La API se conecta a MySQL con los datos del archivo `.env` (en Docker usa `host.docker.internal`, usuario `transport_app`). En otro equipo, copiar `.env.example` como `.env`.

Para instalar la PWA en el celular hace falta HTTPS: con `cloudflared tunnel --url http://localhost:8090` se obtiene un enlace `https://...trycloudflare.com` que sirve la web y la API juntas (paso 11 de `comandos.txt`).

## Usuarios de demostración

Contraseña de todos: `Demo2026`. La pantalla **Ingresar** también los muestra: un clic llena el correo y la contraseña.

| Correo | Rol |
|---|---|
| dueno@transport.test | Dueña (sede central): reporte consolidado de los seis giros |
| gerente.proceso@transport.test | Gerente de la planta de proceso |
| ventas.proceso@transport.test | Vendedor de la planta de proceso |
| gerente.mineria@transport.test | Gerente de extracción minera |
| gerente.maquinaria@transport.test | Gerente de venta y alquiler de maquinaria |
| gerente.transportemp@transport.test | Gerente de transporte de materia prima |
| piloto.transportemp@transport.test | Piloto (transporte de materia prima) |
| gerente.construccion@transport.test | Gerente de construcción |
| laura@losaltos.test | Cliente (Constructora Los Altos) |
| andres@vistahermosa.test | Cliente con un edificio en construcción |

La lista completa (22 usuarios) está en [`docs/endpoints.md`](docs/endpoints.md).

## Demo sugerida

1. **API:** http://localhost:8091/api/salud → MySQL conectado y 107 endpoints.
2. **Sala de ventas:** en http://localhost:8090 recorrer los giros y el catálogo, agregar piso cerámico al carrito e ingresar como **laura@losaltos.test** para confirmar el pedido. Un servicio de construcción pide agendar una reunión.
3. **Gerente de proceso:** la campana muestra la alerta del pedido nuevo. Abrir el pedido, confirmarlo, ponerlo en proceso y despacharlo desde Planta Zacapa; en *Inventario → Kárdex* se ve la salida. Laura recibe cada cambio en sus alertas.
4. **Pedidos entre giros:** el gerente de proceso pide arcilla a minería; **gerente.mineria** lo aprueba y lo despacha, y la planta lo recibe (entra a su inventario).
5. **GPS:** abrir *Flota y GPS* como **gerente.transportemp** y ejecutar `docker compose exec -e INTERVALO_MS=8000 api npm run simular-gps`: el camión avanza por la CA-9 (el mapa se actualiza cada 10 segundos) y a 95 km/h llega la alerta de exceso de velocidad, también al piloto. **gerente.maquinaria** recibe *uso no autorizado* porque la retroexcavadora enciende el motor estando en la sucursal.
6. **Maquinaria:** consultar disponibilidad y reservar una máquina como cliente; el gerente de maquinaria la entrega y luego registra la devolución (con cobro de atraso).
7. **Construcción:** **andres@vistahermosa.test** ve el avance de su edificio contra el plazo; el gerente de construcción registra un avance nuevo.
8. **Dueña:** el panel muestra el resultado de cada giro, la ejecución del presupuesto y las observaciones; en *Reportes* se cambia el periodo y se exporta a Excel (CSV).
9. **Integraciones:** importar un CSV con las plantillas, crear una API key y revisar la bitácora.
10. **Postman:** importar [`docs/TransPort.postman_collection.json`](docs/TransPort.postman_collection.json) y ejecutar *Run collection* (178 peticiones con pruebas).
11. **PWA:** botón *Instalar*; con el navegador sin conexión la app abre y muestra los últimos datos; en *Alertas* se activan las notificaciones push.

Las pruebas y la demo crean registros nuevos; para volver a los datos iniciales se repite el paso 1.

## Pruebas

```powershell
docker compose exec api npm test
```

`api/pruebas/probar_api.mjs` hace 356 verificaciones que recorren los 107 endpoints (flujos completos, permisos por rol, errores y cobertura). La colección de Postman hace la misma demo con 229 pruebas.

## Desarrollo sin Docker (opcional)

Con Node.js 22 instalado: `npm install` y `npm run dev` en `api/` (puerto 3000, usa el `.env` de la raíz) y lo mismo en `web/` (http://localhost:5173, con proxy de `/api` al puerto 3000).

## Documentación

- [`docs/arquitectura.md`](docs/arquitectura.md): arquitectura, capas, composición de archivos, frontend, seguridad, tareas programadas y despliegue.
- [`docs/endpoints.md`](docs/endpoints.md): los 107 endpoints con su acceso, flujos de estado y ejemplos.
- [`docs/base-de-datos.md`](docs/base-de-datos.md): modelo de datos, reglas y flujos de estado.
- [`docs/diagramas/`](docs/diagramas): los diagramas en PNG para la presentación.
- [`docs/TransPort.postman_collection.json`](docs/TransPort.postman_collection.json): colección de Postman.
- [`railway.txt`](railway.txt): cómo publicarlo en Railway desde GitHub.
