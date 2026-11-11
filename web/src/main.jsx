import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App.jsx'
import { ProveedorAvisos } from './contexto/avisos.jsx'
import { ProveedorCarrito } from './contexto/carrito.jsx'
import { ProveedorSesion } from './contexto/sesion.jsx'
import './estilos.css'

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorAvisos>
        <ProveedorSesion>
          <ProveedorCarrito>
            <App />
          </ProveedorCarrito>
        </ProveedorSesion>
      </ProveedorAvisos>
    </BrowserRouter>
  </StrictMode>
)

// El service worker solo existe en la versión compilada (npm run build), no en npm run dev
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.error('Service worker:', error))
  })
}
