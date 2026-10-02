import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  LEVELS_CHANNEL_LABELS,
  applyLevels,
  computeHistogram,
  createDefaultLevels,
  gammaToMidpoint,
  getLevelsChannels,
  getLevelsMax,
  midpointToGamma,
  normalizeParams,
  type LevelParams,
  type LevelsChannel,
  type LevelsSettings
} from '../core/levels';
import type { RasterImage } from '../core/raster';
import { Modal } from './Modal';

type Props = {
  open: boolean;
  image: RasterImage | null;
  onPreview: (image: RasterImage | null) => void;
  onApply: (image: RasterImage) => void;
  onClose: () => void;
};

const CHANNEL_COLORS: Record<LevelsChannel, string> = {
  master: '#3a3f47',
  red: '#d6453d',
  green: '#3f9b4b',
  blue: '#3b6fd6',
  alpha: '#7e57c2'
};

/** Гистограмма на canvas: по X — значение 0..max, по Y — число пикселей (линейно или логарифмически). */
function Histogram({ data, mode, color }: { data: Uint32Array; mode: 'linear' | 'log'; color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const values = Array.from(data, (v) => (mode === 'log' ? Math.log10(v + 1) : v));
    const max = Math.max(1, ...values);
    const barWidth = width / values.length;

    ctx.fillStyle = color;
    values.forEach((v, i) => {
      const h = (v / max) * (height - 2);
      ctx.fillRect(i * barWidth, height - h, Math.max(1, barWidth), h);
    });
  }, [data, mode, color]);

  return <canvas ref={ref} className="levels__histogram" width={512} height={150} />;
}

type Marker = 'black' | 'mid' | 'white';

/** Три маркера входных уровней прямо под осью гистограммы. */
function InputLevelsSlider({ params, max, onChange }: { params: LevelParams; max: number; onChange: (p: LevelParams) => void }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Marker | null>(null);
  const { black, white, gamma } = params;
  const midValue = black + (white - black) * gammaToMidpoint(gamma);

  const valueAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * max;
  };

  const move = (clientX: number) => {
    const marker = dragRef.current;
    if (!marker) return;
    const v = valueAt(clientX);
    if (marker === 'black') onChange(normalizeParams({ ...params, black: Math.min(v, white - 1) }, max));
    if (marker === 'white') onChange(normalizeParams({ ...params, white: Math.max(v, black + 1) }, max));
    if (marker === 'mid') {
      const t = (v - black) / (white - black);
      onChange(normalizeParams({ ...params, gamma: midpointToGamma(t) }, max));
    }
  };

  const start = (marker: Marker) => (event: ReactPointerEvent) => {
    event.preventDefault();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragRef.current = marker;
  };

  const markers: { id: Marker; value: number; label: string }[] = [
    { id: 'black', value: black, label: 'Точка чёрного' },
    { id: 'mid', value: midValue, label: 'Полутона (гамма)' },
    { id: 'white', value: white, label: 'Точка белого' }
  ];

  return (
    <div className="levels__slider">
      <div className="levels__track" ref={trackRef} />
      {markers.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`levels__marker levels__marker--${m.id}`}
          style={{ left: `${(m.value / max) * 100}%` }}
          aria-label={m.label}
          title={m.label}
          onPointerDown={start(m.id)}
          onPointerMove={(e) => move(e.clientX)}
          onPointerUp={() => (dragRef.current = null)}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
            if (!step) return;
            e.preventDefault();
            if (m.id === 'black') onChange(normalizeParams({ ...params, black: Math.min(black + step, white - 1) }, max));
            if (m.id === 'white') onChange(normalizeParams({ ...params, white: Math.max(white + step, black + 1) }, max));
            if (m.id === 'mid') onChange(normalizeParams({ ...params, gamma: gamma - step * 0.05 }, max));
          }}
        />
      ))}
    </div>
  );
}

export function LevelsDialog({ open, image, onPreview, onApply, onClose }: Props) {
  const [settings, setSettings] = useState<LevelsSettings | null>(null);
  const [channel, setChannel] = useState<LevelsChannel>('master');
  const [preview, setPreview] = useState(true);
  const [histMode, setHistMode] = useState<'linear' | 'log'>('linear');

  // новое открытие — начальные значения
  useEffect(() => {
    if (open && image) {
      setSettings(createDefaultLevels(image));
      setChannel('master');
      setPreview(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const channels = useMemo(() => (image ? getLevelsChannels(image) : []), [image]);
  const histogram = useMemo(() => (image && open ? computeHistogram(image, channel) : null), [image, channel, open]);

  // предпросмотр: не чаще одного раза за кадр
  useEffect(() => {
    if (!open || !image || !settings) return;
    if (!preview) {
      onPreview(null);
      return;
    }
    const frame = requestAnimationFrame(() => onPreview(applyLevels(image, settings)));
    return () => cancelAnimationFrame(frame);
  }, [open, image, settings, preview, onPreview]);

  if (!image || !settings) return <Modal open={false} title="Уровни" onClose={onClose}>{null}</Modal>;

  const max = getLevelsMax(image, channel);
  const params = settings[channel];
  const update = (next: LevelParams) => setSettings({ ...settings, [channel]: next });
  const setField = (field: keyof LevelParams, value: number) => {
    if (!Number.isFinite(value)) return;
    update(normalizeParams({ ...params, [field]: value }, max));
  };

  return (
    <Modal
      open={open}
      title="Уровни"
      width={600}
      onClose={onClose}
      footer={
        <>
          <label className="check">
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
            Предпросмотр
          </label>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => setSettings(createDefaultLevels(image))}>
            Сбросить
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onApply(applyLevels(image, settings))}>
            Применить
          </button>
        </>
      }
    >
      <div className="form-row">
        <label className="field">
          <span>Канал</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value as LevelsChannel)}>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c === 'master' && channels.length <= 2 ? 'Master (серый)' : LEVELS_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Шкала гистограммы">
          <button type="button" aria-pressed={histMode === 'linear'} onClick={() => setHistMode('linear')}>
            Линейная
          </button>
          <button type="button" aria-pressed={histMode === 'log'} onClick={() => setHistMode('log')}>
            Логарифм.
          </button>
        </div>
      </div>

      <div className="levels">
        {histogram && <Histogram data={histogram} mode={histMode} color={CHANNEL_COLORS[channel]} />}
        <div className="levels__axis">
          <span>0</span>
          <span>{max}</span>
        </div>
        <InputLevelsSlider params={params} max={max} onChange={update} />
      </div>

      <div className="levels__inputs">
        <label className="field field--compact">
          <span>Чёрная точка</span>
          <input type="number" min={0} max={max - 1} value={params.black} onChange={(e) => setField('black', Number(e.target.value))} />
        </label>
        <label className="field field--compact">
          <span>Гамма</span>
          <input type="number" min={0.1} max={9.9} step={0.01} value={params.gamma} onChange={(e) => setField('gamma', Number(e.target.value))} />
        </label>
        <label className="field field--compact">
          <span>Белая точка</span>
          <input type="number" min={1} max={max} value={params.white} onChange={(e) => setField('white', Number(e.target.value))} />
        </label>
      </div>
      <p className="muted hint">
        Диапазон канала: 0…{max}
        {image.bits === 7 && channel !== 'alpha' ? ' (GB7, 7 бит)' : ''}. Изменения каждого канала сохраняются при переключении.
      </p>
    </Modal>
  );
}
