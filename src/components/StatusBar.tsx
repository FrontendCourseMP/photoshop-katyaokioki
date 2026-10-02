import { useEffect, useState } from 'react';
import type { SourceInfo } from '../core/formats';
import { INTERPOLATORS } from '../core/interpolation';
import { MAX_PERCENT, MIN_PERCENT, clampPercent } from './Workspace';

type Props = {
  fileName: string;
  info: SourceInfo | null;
  width: number | null;
  height: number | null;
  message: string;
  percent: number;
  interpolation: string;
  onPercentChange: (percent: number) => void;
  onFit: () => void;
  onInterpolationChange: (mode: string) => void;
};

const PRESETS = [12, 25, 33, 50, 67, 100, 150, 200, 300];

/**
 * Строка состояния. Всегда прижата к низу окна, поэтому элементы
 * масштаба не двигаются при смене изображения. Каждая величина выводится один раз.
 */
export function StatusBar({ fileName, info, width, height, message, percent, interpolation, onPercentChange, onFit, onInterpolationChange }: Props) {
  const disabled = !info;
  const [draft, setDraft] = useState(String(percent));
  useEffect(() => setDraft(String(percent)), [percent]);

  const commitDraft = () => {
    const value = Number(draft);
    if (Number.isFinite(value) && value > 0) {
      const clamped = clampPercent(value);
      onPercentChange(clamped);
      setDraft(String(clamped));
    } else setDraft(String(percent));
  };

  return (
    <footer className="statusbar">
      <div className="statusbar__group statusbar__file" title={fileName}>
        {info ? (
          <>
            <span className="statusbar__name">{fileName}</span>
            <span className="statusbar__badge">{info.format}</span>
          </>
        ) : (
          <span className="muted">Нет изображения</span>
        )}
      </div>

      <div className="statusbar__group statusbar__dims" title="Размер изображения в пикселях">
        <span className="muted">Размер</span>
        <b>{width && height ? `${width} × ${height} px` : '—'}</b>
      </div>

      <div className="statusbar__group statusbar__depth" title={info?.depthDetails}>
        <span className="muted">Глубина</span>
        <b>{info ? `${info.bitsPerPixel} бит` : '—'}</b>
        {info && <span className="muted statusbar__details">({info.depthDetails})</span>}
      </div>

      <div className="statusbar__message" aria-live="polite">
        {message}
      </div>

      <div className="statusbar__group statusbar__zoom">
        <label className="muted" htmlFor="zoom-range">
          Масштаб
        </label>
        <input
          id="zoom-range"
          type="range"
          min={MIN_PERCENT}
          max={MAX_PERCENT}
          step={1}
          value={percent}
          disabled={disabled}
          onChange={(e) => onPercentChange(Number(e.target.value))}
        />
        <span className="zoom-input">
          <input
            type="number"
            min={MIN_PERCENT}
            max={MAX_PERCENT}
            value={draft}
            disabled={disabled}
            aria-label="Масштаб в процентах"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => e.key === 'Enter' && commitDraft()}
          />
          %
        </span>
        <select
          value=""
          disabled={disabled}
          aria-label="Готовые масштабы"
          onChange={(e) => {
            if (e.target.value === 'fit') onFit();
            else if (e.target.value) onPercentChange(Number(e.target.value));
          }}
        >
          <option value="">▾</option>
          <option value="fit">Вписать в окно</option>
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}%
            </option>
          ))}
        </select>
        <select
          value={interpolation}
          disabled={disabled}
          title="Метод интерполяции при отображении"
          onChange={(e) => onInterpolationChange(e.target.value)}
        >
          {INTERPOLATORS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
    </footer>
  );
}
