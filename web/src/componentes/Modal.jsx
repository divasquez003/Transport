import { useEffect, useRef } from 'react'

// Ventana modal con <dialog>: se cierra con Esc, con el botón o al hacer clic fuera
export function Modal({ abierto, titulo, onCerrar, children, ancho }) {
  const dialogo = useRef(null)

  useEffect(() => {
    const d = dialogo.current
    if (abierto && !d.open) d.showModal()
    if (!abierto && d.open) d.close()
  }, [abierto])

  return (
    <dialog
      ref={dialogo}
      className={`modal${ancho ? ' modal-ancho' : ''}`}
      onClose={onCerrar}
      onClick={(e) => e.target === dialogo.current && onCerrar()}
    >
      {abierto && (
        <div className="modal-contenido">
          <div className="modal-encabezado">
            <h2>{titulo}</h2>
            <button type="button" className="cerrar" aria-label="Cerrar" onClick={onCerrar}>×</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

// Pide un comentario antes de una acción (cancelar, rechazar...). onConfirmar recibe el texto.
export function ModalComentario({ abierto, titulo, etiqueta = 'Comentario', requerido = false, textoBoton = 'Confirmar', peligro, onCerrar, onConfirmar, children }) {
  const enviar = async (e) => {
    e.preventDefault()
    const texto = new FormData(e.currentTarget).get('comentario').trim()
    await onConfirmar(texto)
  }
  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCerrar}>
      <form className="formulario" onSubmit={enviar}>
        {children}
        <label className="campo">
          <span>{etiqueta}{requerido ? '' : ' (opcional)'}</span>
          <textarea name="comentario" rows={3} maxLength={255} required={requerido} />
        </label>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" onClick={onCerrar}>Volver</button>
          <button type="submit" className={`boton${peligro ? ' boton-peligro' : ''}`}>{textoBoton}</button>
        </div>
      </form>
    </Modal>
  )
}
