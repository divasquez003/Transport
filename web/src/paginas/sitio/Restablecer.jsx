import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Campo } from '../../componentes/comunes.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { enviar } from '../../lib/api.js'

// Enlace de un solo uso para crear una contraseña nueva: /restablecer?token=...
export default function Restablecer() {
  const [parametros] = useSearchParams()
  const avisos = useAvisos()
  const [listo, setListo] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    const { password_nueva: nueva, confirmar } = Object.fromEntries(new FormData(e.currentTarget))
    if (nueva !== confirmar) return avisos.error('Las contraseñas no coinciden')
    try {
      await enviar('/auth/restablecer', { token: parametros.get('token') ?? '', password_nueva: nueva })
      setListo(true)
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <main className="contenedor">
      <div className="caja-login">
        <h1>Nueva contraseña</h1>
        {listo ? (
          <p>Contraseña restablecida. <Link to="/ingresar">Iniciar sesión</Link></p>
        ) : (
          <form className="formulario" onSubmit={guardar}>
            <Campo etiqueta="Nueva contraseña (mínimo 8 caracteres)"><input name="password_nueva" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></Campo>
            <Campo etiqueta="Confirmar contraseña"><input name="confirmar" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></Campo>
            <button className="boton" type="submit">Guardar contraseña</button>
          </form>
        )}
      </div>
    </main>
  )
}
