import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
  separatorBefore?: boolean;
}

export interface Menu {
  label: string;
  items: MenuItem[];
}

/** Строка меню в стиле настольных редакторов. */
export function MenuBar({ menus, title }: { menus: Menu[]; title: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpenIndex(null);
    };
    const esc = (event: KeyboardEvent) => event.key === 'Escape' && setOpenIndex(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [openIndex]);

  return (
    <div className="menubar" ref={ref}>
      <span className="menubar__logo" aria-hidden>
        ◧
      </span>
      <nav className="menubar__menus">
        {menus.map((menu, index) => (
          <div className="menu" key={menu.label}>
            <button
              type="button"
              className={`menu__trigger${openIndex === index ? ' menu__trigger--open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={openIndex === index}
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              onMouseEnter={() => openIndex !== null && setOpenIndex(index)}
            >
              {menu.label}
            </button>
            {openIndex === index && (
              <div className="menu__list" role="menu">
                {menu.items.map((item) => (
                  <div key={item.label}>
                    {item.separatorBefore && <hr />}
                    <button
                      type="button"
                      role="menuitem"
                      className="menu__item"
                      disabled={item.disabled}
                      onClick={() => {
                        setOpenIndex(null);
                        item.onSelect();
                      }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <span className="menubar__title">{title}</span>
    </div>
  );
}
