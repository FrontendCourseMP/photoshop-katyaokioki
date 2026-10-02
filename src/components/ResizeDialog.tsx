import { useEffect, useState } from 'react';
import { DEFAULT_INTERPOLATION, INTERPOLATORS, getInterpolator } from '../core/interpolation';
import { Modal } from './Modal';

type Unit = 'percent' | 'px';

type Props = {
  open: boolean;
  width: number;
  height: number;
  onApply: (width: number, height: number, mode: string) => void;
  onClose: () => void;
};

export const MAX_SIDE = 10000;
const MAX_PERCENT = 1000;

const megapixels = (w: number, h: number) => `${((w * h) / 1e6).toFixed(2)} Мп`;

/** Проверка значения поля. Возвращает размер в пикселях или текст ошибки. */
function validate(raw: string, unit: Unit, base: number): { px: number } | { error: string } {
  if (raw.trim() === '') return { error: 'Введите значение' };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { error: 'Должно быть числом' };
  if (unit === 'px') {
    if (!Number.isInteger(value)) return { error: 'Целое число пикселей' };
    if (value < 1 || value > MAX_SIDE) return { error: `От 1 до ${MAX_SIDE} px` };
    return { px: value };
  }
  if (value <= 0 || value > MAX_PERCENT) return { error: `От 0 до ${MAX_PERCENT}%` };
  const px = Math.round((base * value) / 100);
  if (px < 1) return { error: 'Меньше 1 пикселя' };
  if (px > MAX_SIDE) return { error: `Больше ${MAX_SIDE} px` };
  return { px };
}

const fmt = (v: number) => String(Math.round(v * 100) / 100);

export function ResizeDialog({ open, width, height, onApply, onClose }: Props) {
  const [unit, setUnit] = useState<Unit>('percent');
  const [w, setW] = useState('100');
  const [h, setH] = useState('100');
  const [linked, setLinked] = useState(true);
  const [mode, setMode] = useState<string>(DEFAULT_INTERPOLATION);

  useEffect(() => {
    if (open) {
      setUnit('percent');
      setW('100');
      setH('100');
      setLinked(true);
    }
  }, [open]);

  const vw = validate(w, unit, width);
  const vh = validate(h, unit, height);
  const newW = 'px' in vw ? vw.px : null;
  const newH = 'px' in vh ? vh.px : null;
  const ok = newW !== null && newH !== null;

  const changeUnit = (next: Unit) => {
    // переводим текущие значения в новые единицы
    const pw = newW ?? width;
    const ph = newH ?? height;
    if (next === 'px') {
      setW(String(pw));
      setH(String(ph));
    } else {
      setW(fmt((pw / width) * 100));
      setH(fmt((ph / height) * 100));
    }
    setUnit(next);
  };

  const changeW = (raw: string) => {
    setW(raw);
    if (!linked) return;
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return;
    setH(unit === 'percent' ? raw : String(Math.max(1, Math.round((v * height) / width))));
  };

  const changeH = (raw: string) => {
    setH(raw);
    if (!linked) return;
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return;
    setW(unit === 'percent' ? raw : String(Math.max(1, Math.round((v * width) / height))));
  };

  const interpolator = getInterpolator(mode);

  return (
    <Modal
      open={open}
      title="Размер изображения"
      width={460}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn btn--primary" disabled={!ok} onClick={() => ok && onApply(newW, newH, mode)}>
            Применить
          </button>
        </>
      }
    >
      <div className="resize__mp">
        <div>
          <span className="muted">Было</span>
          <b>{megapixels(width, height)}</b>
          <span className="muted">
            {width} × {height} px
          </span>
        </div>
        <div aria-hidden className="resize__arrow">
          →
        </div>
        <div>
          <span className="muted">Станет</span>
          <b>{ok ? megapixels(newW, newH) : '—'}</b>
          <span className="muted">{ok ? `${newW} × ${newH} px` : 'проверьте поля'}</span>
        </div>
      </div>

      <label className="field">
        <span>Единицы</span>
        <select value={unit} onChange={(e) => changeUnit(e.target.value as Unit)}>
          <option value="percent">Проценты</option>
          <option value="px">Пиксели</option>
        </select>
      </label>

      <div className="resize__dims">
        <label className="field">
          <span>Ширина, {unit === 'px' ? 'px' : '%'}</span>
          <input type="number" value={w} min={1} step={unit === 'px' ? 1 : 0.01} onChange={(e) => changeW(e.target.value)} aria-invalid={'error' in vw} />
          {'error' in vw && <small className="error">{vw.error}</small>}
        </label>
        <label className="field">
          <span>Высота, {unit === 'px' ? 'px' : '%'}</span>
          <input type="number" value={h} min={1} step={unit === 'px' ? 1 : 0.01} onChange={(e) => changeH(e.target.value)} aria-invalid={'error' in vh} />
          {'error' in vh && <small className="error">{vh.error}</small>}
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />
        Сохранять пропорции
      </label>

      <label className="field">
        <span>
          Интерполяция{' '}
          <span className="tooltip" tabIndex={0} aria-label={interpolator.description}>
            ?<span className="tooltip__bubble" role="tooltip">
              <b>{interpolator.name}.</b> {interpolator.description}
            </span>
          </span>
        </span>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {INTERPOLATORS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  );
}
