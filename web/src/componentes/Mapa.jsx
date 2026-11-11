import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'

const GUATEMALA = [15.3, -90.3]

// Ajusta la vista para que se vean todos los puntos
function Encuadre({ puntos }) {
  const mapa = useMap()
  const clave = puntos.map((p) => p.join(',')).join(';')
  useEffect(() => {
    if (puntos.length === 1) mapa.setView(puntos[0], 12)
    else if (puntos.length > 1) mapa.fitBounds(puntos, { padding: [30, 30], maxZoom: 13 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, mapa])
  return null
}

// marcadores: [{ id, latitud, longitud, color, texto, onClick }]; recorrido: [{ latitud, longitud }]
export function Mapa({ marcadores = [], recorrido = [], alto = 380 }) {
  const linea = recorrido.map((p) => [Number(p.latitud), Number(p.longitud)])
  const puntos = [...marcadores.filter((m) => m.latitud != null).map((m) => [Number(m.latitud), Number(m.longitud)]), ...linea]
  return (
    <div className="mapa" style={{ height: alto }}>
      <MapContainer center={GUATEMALA} zoom={7} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {linea.length > 1 && <Polyline positions={linea} pathOptions={{ color: '#0b3d91', weight: 4, opacity: 0.7 }} />}
        {linea.map((p, i) => (
          <CircleMarker key={`r${i}`} center={p} radius={3} pathOptions={{ color: '#0b3d91', fillOpacity: 1 }}>
            <Tooltip>{recorrido[i].registrado_en?.slice(11, 16)} · {recorrido[i].velocidad_kmh ?? 0} km/h</Tooltip>
          </CircleMarker>
        ))}
        {marcadores.filter((m) => m.latitud != null).map((m) => (
          <CircleMarker
            key={m.id}
            center={[Number(m.latitud), Number(m.longitud)]}
            radius={10}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: m.color ?? '#f28c28', fillOpacity: 1 }}
            eventHandlers={m.onClick ? { click: m.onClick } : undefined}
          >
            <Tooltip direction={m.permanente ? 'auto' : 'top'} offset={m.permanente ? [0, 0] : [0, -8]} permanent={m.permanente}>{m.texto}</Tooltip>
          </CircleMarker>
        ))}
        <Encuadre puntos={puntos} />
      </MapContainer>
    </div>
  )
}
