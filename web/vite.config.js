import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Archivos de public/ (manifiesto e íconos) para que el service worker también los guarde
function archivosPublicos(carpeta = 'public') {
  return readdirSync(carpeta, { withFileTypes: true, recursive: true })
    .filter((entrada) => entrada.isFile())
    .map((entrada) => `/${relative('public', join(entrada.parentPath, entrada.name)).replaceAll('\\', '/')}`)
}

// Al compilar genera dist/sw.js desde src/sw.js con la versión y la lista de archivos (con hash)
function serviceWorker() {
  return {
    name: 'transport-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(opciones, bundle) {
      const archivos = [...new Set(['/', '/index.html', ...Object.keys(bundle).map((nombre) => `/${nombre}`), ...archivosPublicos()])]
        .filter((archivo) => !archivo.endsWith('.map'))
      const codigo = readFileSync('src/sw.js', 'utf8')
        .replace("'__VERSION__'", JSON.stringify(String(Date.now())))
        .replace("'__ARCHIVOS__'", JSON.stringify(archivos, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: codigo })
    }
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    // npm run dev: la API corre aparte en el puerto 3000 (cd ../api && npm run dev)
    proxy: { '/api': 'http://localhost:3000' }
  },
  build: {
    chunkSizeWarningLimit: 800
  }
})
