import { Campo, Contenido, Encabezado } from '../../componentes/comunes.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { enviar } from '../../lib/api.js'
import { fechaHora, ROLES } from '../../lib/formato.js'
import { esCliente } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

export default function Perfil() {
  const { usuario } = useSesion()
  const avisos = useAvisos()

  const cambiarPassword = async (e) => {
    e.preventDefault()
    const formulario = e.currentTarget
    const { password_actual: actual, password_nueva: nueva, confirmar } = Object.fromEntries(new FormData(formulario))
    if (nueva !== confirmar) return avisos.error('Las contraseñas nuevas no coinciden')
    try {
      await enviar('/auth/password', { password_actual: actual, password_nueva: nueva }, 'PUT')
      formulario.reset()
      avisos.exito('Contraseña actualizada')
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <>
      <Encabezado titulo="Mi perfil" />
      <div className="rejilla-panel">
        <section className="tarjeta-panel">
          <h2>{usuario.nombre}</h2>
          <dl className="datos">
            <dt>Correo</dt><dd>{usuario.correo}</dd>
            <dt>Teléfono</dt><dd>{usuario.telefono ?? '—'}</dd>
            <dt>Rol</dt><dd>{ROLES[usuario.rol]}</dd>
            {esCliente(usuario) ? <><dt>Empresa</dt><dd>{usuario.cliente}</dd></> : <><dt>Giro</dt><dd>{usuario.giro ?? 'Sede central (todos los giros)'}</dd><dt>Sede</dt><dd>{usuario.sede ?? '—'}</dd></>}
            <dt>Último acceso</dt><dd>{fechaHora(usuario.ultimo_acceso)}</dd>
          </dl>
          <p className="ayuda">Para cambiar su rol o su sede comuníquese con la administración general.</p>
        </section>
        <section className="tarjeta-panel">
          <h2>Cambiar contraseña</h2>
          <form className="formulario" onSubmit={cambiarPassword}>
            <Campo etiqueta="Contraseña actual"><input name="password_actual" type="password" required autoComplete="current-password" /></Campo>
            <Campo etiqueta="Nueva contraseña (mínimo 8 caracteres)"><input name="password_nueva" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></Campo>
            <Campo etiqueta="Confirmar nueva contraseña"><input name="confirmar" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></Campo>
            <button type="submit" className="boton">Guardar contraseña</button>
          </form>
        </section>
        {esCliente(usuario) && <DatosEmpresa clienteId={usuario.cliente_id} />}
      </div>
    </>
  )
}

// El cliente actualiza los datos de contacto de su empresa
function DatosEmpresa({ clienteId }) {
  const avisos = useAvisos()
  const consulta = useDatos(`/clientes/${clienteId}`)
  const c = consulta.datos

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    try {
      await enviar(`/clientes/${clienteId}`, datos, 'PUT')
      avisos.exito('Datos de contacto actualizados')
      consulta.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <section className="tarjeta-panel">
      <h2>Datos de mi empresa</h2>
      <Contenido consulta={consulta}>
        {c && (
          <form className="formulario" onSubmit={guardar}>
            <p><strong>{c.nombre}</strong>{c.nit && ` · NIT ${c.nit}`}</p>
            <Campo etiqueta="Correo de contacto"><input name="correo" type="email" maxLength={120} defaultValue={c.correo ?? ''} /></Campo>
            <Campo etiqueta="Teléfono"><input name="telefono" maxLength={20} defaultValue={c.telefono ?? ''} /></Campo>
            <Campo etiqueta="Dirección"><input name="direccion" maxLength={200} defaultValue={c.direccion ?? ''} /></Campo>
            <button type="submit" className="boton">Guardar</button>
          </form>
        )}
      </Contenido>
    </section>
  )
}
