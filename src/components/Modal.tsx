import { useEffect, useRef, type ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
};

/**
 * Обобщённое модальное окно на основе <dialog>.
 * Esc и кнопка × вызывают onClose (то же, что «Отмена»).
 */
export function Modal({ open, title, onClose, children, footer, width = 560 }: ModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      style={{ width: `min(${width}px, calc(100vw - 24px))` }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <header className="modal__header">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
              ✕
            </button>
          </header>
          <div className="modal__body">{children}</div>
          {footer && <footer className="modal__footer">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}
