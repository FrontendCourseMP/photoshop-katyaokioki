import { rgbToHex, type Lab } from '../core/color';

export interface PickedColor {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  alpha: number | null;
  /** значения каналов в исходном диапазоне (для GB7 — 0..127) */
  raw: number[];
  bits: number;
  lab: Lab;
}

/** Панель «Инфо» с результатом пипетки. */
export function InfoPanel({ picked, active }: { picked: PickedColor | null; active: boolean }) {
  return (
    <section className="panel">
      <h3 className="panel__title">Пипетка</h3>
      {!picked ? (
        <p className="muted panel__hint">{active ? 'Кликните по изображению.' : 'Выберите инструмент «Пипетка» (I) слева.'}</p>
      ) : (
        <div className="picker">
          <div className="picker__swatch" style={{ background: rgbToHex(picked) }} title={rgbToHex(picked)} />
          <dl className="picker__grid">
            <dt>X</dt>
            <dd>{picked.x}</dd>
            <dt>Y</dt>
            <dd>{picked.y}</dd>
            <dt className="c-red">R</dt>
            <dd>{picked.r}</dd>
            <dt className="c-green">G</dt>
            <dd>{picked.g}</dd>
            <dt className="c-blue">B</dt>
            <dd>{picked.b}</dd>
            {picked.alpha !== null && (
              <>
                <dt>A</dt>
                <dd>{picked.alpha}</dd>
              </>
            )}
            <dt>L*</dt>
            <dd>{picked.lab.l.toFixed(2)}</dd>
            <dt>a*</dt>
            <dd>{picked.lab.a.toFixed(2)}</dd>
            <dt>b*</dt>
            <dd>{picked.lab.b.toFixed(2)}</dd>
          </dl>
          {picked.bits !== 8 && (
            <p className="muted panel__hint">
              Исходное значение: {picked.raw[0]} из {(1 << picked.bits) - 1} ({picked.bits} бит)
            </p>
          )}
        </div>
      )}
    </section>
  );
}
