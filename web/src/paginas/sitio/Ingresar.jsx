import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Campo, Pestanas } from '../../componentes/comunes.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { enviar } from '../../lib/api.js'

// Usuarios de la base de datos de demostración (contraseña Demo2026)
const DEMO = [
  ['dueno@transport.test', 'Dueña (sede central)'],
  ['admin@transport.test', 'Administrador general'],
  ['gerente.mineria@transport.test', 'Gerente de extracción minera'],
  ['operador.mineria@transport.test', 'Operador de planta minera'],
  ['gerente.proceso@transport.test', 'Gerente de planta de proceso'],
  ['ventas.proceso@transport.test', 'Vendedor de pisos y materiales'],
  ['gerente.maquinaria@transport.test', 'Gerente de maquinaria'],
  ['gerente.transportemp@transport.test', 'Gerente de transporte de materia prima'],
  ['piloto.transportemp@transport.test', 'Piloto de camión'],
  ['gerente.logistica@transport.test', 'Gerente de transporte de productos'],
  ['gerente.construccion@transport.test', 'Gerente de construcción'],
  ['ventas.construccion@transport.test', 'Vendedor de construcción'],
  ['laura@losaltos.test', 'Cliente: Constructora Los Altos'],
  ['andres@vistahermosa.test', 'Cliente: Inmobiliaria Vista Hermosa'],
  ['oscar@cementeranorte.test', 'Cliente: Cementera del Norte']
]

export default function Ingresar() {
  const [parametros] = useSearchParams()
  const { usuario, login, registrar } = useSesion()
  const avisos = useAvisos()
  const navegar = useNavigate()
  const [pestana, setPestana] = useState(parametros.get('registro') ? 'registro' : 'ingresar')
  const [correo, setCorreo] = useState('')
  const [password, setPassword] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [tipo, setTipo] = useState('empresa')
  const [recuperacion, setRecuperacion] = useState(null)
  const volver = parametros.get('volver') ?? '/portal'

  if (usuario && !enviando) return <Navigate to={volver} replace />

  const ejecutar = async (accion) => {
    setEnviando(true)
    try {
      await accion()
    } catch (error) {
      avisos.error(error)
    } finally {
      setEnviando(false)
    }
  }

  const ingresar = (e) => {
    e.preventDefault()
    ejecutar(async () => {
      const u = await login(correo, password)
      avisos.exito(`Bienvenido, ${u.nombre}`)
      navegar(volver, { replace: true })
    })
  }

  const crearCuenta = (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    if (datos.password !== datos.confirmar) return avisos.error('Las contraseñas no coinciden')
    delete datos.confirmar
    ejecutar(async () => {
      await registrar(datos)
      avisos.exito('Cuenta creada. Ya puede hacer pedidos en línea.')
      navegar(volver, { replace: true })
    })
  }

  const recuperar = (e) => {
    e.preventDefault()
    const datos = Object.fromEntries(new FormData(e.currentTarget))
    ejecutar(async () => setRecuperacion(await enviar('/auth/recuperar', datos)))
  }

  return (
    <main className="contenedor">
      <div className="caja-login">
        <Pestanas
          opciones={[{ id: 'ingresar', texto: 'Iniciar sesión' }, { id: 'registro', texto: 'Crear cuenta' }, { id: 'recuperar', texto: 'Olvidé mi contraseña' }]}
          activa={pestana}
          onCambiar={setPestana}
        />

        {pestana === 'ingresar' && (
          <form className="formulario" onSubmit={ingresar}>
            <Campo etiqueta="Correo electrónico"><input type="email" required autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} /></Campo>
            <Campo etiqueta="Contraseña"><input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Campo>
            <button className="boton" type="submit" disabled={enviando}>{enviando ? 'Ingresando...' : 'Ingresar'}</button>
            <details className="demo">
              <summary>Usuarios de demostración (contraseña Demo2026)</summary>
              <ul>
                {DEMO.map(([c, rol]) => (
                  <li key={c}>
                    <button type="button" className="boton-texto" onClick={() => { setCorreo(c); setPassword('Demo2026') }}>{c}</button> · {rol}
                  </li>
                ))}
              </ul>
            </details>
          </form>
        )}

        {pestana === 'registro' && (
          <form className="formulario" onSubmit={crearCuenta}>
            <p className="ayuda">Cuenta de cliente para hacer pedidos en línea, agendar reuniones y dar seguimiento a sus entregas.</p>
            <Campo etiqueta="Tipo de cliente">
              <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="empresa">Empresa</option>
                <option value="persona">Persona individual</option>
              </select>
            </Campo>
            {tipo === 'empresa' && <Campo etiqueta="Nombre de la empresa"><input name="empresa" required maxLength={150} /></Campo>}
            <Campo etiqueta="NIT (opcional)"><input name="nit" maxLength={20} /></Campo>
            <Campo etiqueta="Su nombre"><input name="nombre" required maxLength={100} autoComplete="name" /></Campo>
            <Campo etiqueta="Correo electrónico"><input name="correo" type="email" required maxLength={120} autoComplete="email" /></Campo>
            <Campo etiqueta="Teléfono"><input name="telefono" maxLength={20} autoComplete="tel" /></Campo>
            <Campo etiqueta="Dirección"><input name="direccion" maxLength={200} /></Campo>
            <Campo etiqueta="Contraseña (mínimo 8 caracteres)"><input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></Campo>
            <Campo etiqueta="Confirmar contraseña"><input name="confirmar" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></Campo>
            <button className="boton" type="submit" disabled={enviando}>{enviando ? 'Creando cuenta...' : 'Crear cuenta'}</button>
          </form>
        )}

        {pestana === 'recuperar' && (
          <form className="formulario" onSubmit={recuperar}>
            <p className="ayuda">Le enviaremos un enlace para crear una nueva contraseña (válido por 30 minutos).</p>
            <Campo etiqueta="Correo electrónico"><input name="correo" type="email" required /></Campo>
            <button className="boton" type="submit" disabled={enviando}>Enviar enlace</button>
            {recuperacion && <p className="exito">{recuperacion.mensaje}</p>}
            {recuperacion?.token_desarrollo && (
              <p className="ayuda">
                Modo de desarrollo (APP_DEBUG=1): el correo no se envía.{' '}
                <Link to={`/restablecer?token=${recuperacion.token_desarrollo}`}>Abrir el enlace de restablecimiento</Link>
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  )
}
