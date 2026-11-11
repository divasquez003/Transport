import { useState } from 'react'
import { Campo, Contenido, Encabezado, Estado } from '../../componentes/comunes.jsx'
import { Modal } from '../../componentes/Modal.jsx'
import { useAvisos } from '../../contexto/avisos.jsx'
import { useSesion } from '../../contexto/sesion.jsx'
import { consulta, enviar } from '../../lib/api.js'
import { haceCuanto, ROLES } from '../../lib/formato.js'
import { esCentral } from '../../lib/permisos.js'
import { useDatos } from '../../lib/useDatos.js'

const ROLES_PERSONAL = ['dueno', 'admin_general', 'gerente', 'administrativo', 'vendedor', 'operativo']

// Personal de la empresa. La sede central crea y edita; el gerente consulta el personal de su giro.
export default function Usuarios() {
  const { usuario } = useSesion()
  const avisos = useAvisos()
  const central = esCentral(usuario)
  const [filtros, setFiltros] = useState({ rol: '', giro_id: '', activo: '1' })
  const lista = useDatos(`/usuarios${consulta(filtros)}`)
  const giros = useDatos('/giros')
  const [editar, setEditar] = useState(null)

  const cambiarActivo = async (u) => {
    try {
      await enviar(`/usuarios/${u.id}/estado`, { activo: !u.activo }, 'PATCH')
      avisos.exito(u.activo ? `${u.nombre} ya no puede iniciar sesión` : `${u.nombre} reactivado`)
      lista.recargar()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <>
      <Encabezado titulo="Usuarios" descripcion={central ? 'Personal de la sede central y de cada giro de negocio, con su rol.' : `Personal de ${usuario.giro}.`}>
        {central && <button type="button" className="boton" onClick={() => setEditar({})}>Nuevo usuario</button>}
      </Encabezado>
      <div className="filtros">
        <select value={filtros.rol} onChange={(e) => setFiltros({ ...filtros, rol: e.target.value })} aria-label="Rol">
          <option value="">Todos los roles</option>
          {ROLES_PERSONAL.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
        </select>
        {central && (
          <select value={filtros.giro_id} onChange={(e) => setFiltros({ ...filtros, giro_id: e.target.value })} aria-label="Giro">
            <option value="">Todos los giros</option>
            {giros.datos?.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        )}
        <select value={filtros.activo} onChange={(e) => setFiltros({ ...filtros, activo: e.target.value })} aria-label="Estado">
          <option value="1">Activos</option>
          <option value="0">Desactivados</option>
        </select>
      </div>
      <Contenido consulta={lista} vacio="No hay usuarios con esos filtros.">
        <div className="tabla">
          <table>
            <thead><tr><th>Nombre</th><th>Rol</th><th>Giro y sede</th><th>Contacto</th><th>Último acceso</th><th>Estado</th>{central && <th />}</tr></thead>
            <tbody>
              {lista.datos?.map((u) => (
                <tr key={u.id} className={u.activo ? '' : 'atenuado'}>
                  <td><strong>{u.nombre}</strong></td>
                  <td>{u.rol_nombre}</td>
                  <td>{u.giro ?? 'Sede central'}<br /><small>{u.sede}</small></td>
                  <td>{u.correo}<br /><small>{u.telefono}</small></td>
                  <td>{u.ultimo_acceso ? haceCuanto(u.ultimo_acceso) : 'Nunca'}</td>
                  <td>{u.activo ? <Estado valor="entregado" texto="Activo" /> : <Estado valor="cancelado" texto="Desactivado" />}</td>
                  {central && (
                    <td className="acciones-fila">
                      <button type="button" className="boton-texto" onClick={() => setEditar(u)}>Editar</button>
                      {u.id !== usuario.id && <button type="button" className="boton-texto" onClick={() => cambiarActivo(u)}>{u.activo ? 'Desactivar' : 'Reactivar'}</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Contenido>
      {editar && <FormularioUsuario actual={editar} giros={giros.datos ?? []} onCerrar={() => setEditar(null)} onGuardado={() => { setEditar(null); lista.recargar() }} />}
    </>
  )
}

function FormularioUsuario({ actual, giros, onCerrar, onGuardado }) {
  const avisos = useAvisos()
  const editando = Boolean(actual.id)
  const [rol, setRol] = useState(actual.rol ?? 'vendedor')
  const [giroId, setGiroId] = useState(String(actual.giro_id ?? ''))
  const central = ['dueno', 'admin_general'].includes(rol)
  const sedes = useDatos(central ? '/sedes?tipo=central' : giroId ? `/sedes?giro_id=${giroId}` : null)

  const guardar = async (e) => {
    e.preventDefault()
    const datos = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ''))
    for (const campo of ['giro_id', 'sede_id']) if (datos[campo]) datos[campo] = Number(datos[campo])
    try {
      if (editando) await enviar(`/usuarios/${actual.id}`, datos, 'PUT')
      else await enviar('/usuarios', datos)
      avisos.exito(editando ? 'Usuario actualizado' : 'Usuario creado; ya puede iniciar sesión')
      onGuardado()
    } catch (error) {
      avisos.error(error)
    }
  }

  return (
    <Modal abierto titulo={editando ? `Editar ${actual.nombre}` : 'Nuevo usuario'} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={guardar}>
        <div className="rejilla-campos">
          <Campo etiqueta="Nombre"><input name="nombre" required maxLength={100} defaultValue={actual.nombre ?? ''} /></Campo>
          <Campo etiqueta="Correo"><input name="correo" type="email" required maxLength={120} defaultValue={actual.correo ?? ''} /></Campo>
          <Campo etiqueta="Teléfono"><input name="telefono" maxLength={20} defaultValue={actual.telefono ?? ''} /></Campo>
          <Campo etiqueta="Rol">
            <select name="rol" value={rol} onChange={(e) => setRol(e.target.value)}>
              {ROLES_PERSONAL.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select>
          </Campo>
          {!central && (
            <Campo etiqueta="Giro de negocio">
              <select name="giro_id" required value={giroId} onChange={(e) => setGiroId(e.target.value)}>
                <option value="" disabled>Seleccione</option>
                {giros.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Sede">
            <select key={`${central}-${giroId}`} name="sede_id" defaultValue={actual.giro_id === Number(giroId) || central ? actual.sede_id ?? '' : ''}>
              <option value="">{central ? 'Oficinas centrales' : 'Seleccione'}</option>
              {sedes.datos?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta={editando ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}>
            <input name="password" type="password" minLength={8} maxLength={72} required={!editando} autoComplete="new-password" />
          </Campo>
        </div>
        <p className="ayuda">Dueño y administrador general pertenecen a la sede central y ven todos los giros; los demás roles solo ven su giro.</p>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="boton">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
