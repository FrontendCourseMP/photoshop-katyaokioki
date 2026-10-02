import { useEffect, useMemo, useRef, useState } from 'react';
import { EDGE_MODE_LABELS, KERNEL_PRESETS, getPreset, kernelDivisor, type EdgeMode } from '../core/convolution';
import { CancelledError, FilterRunner, type FilterParams } from '../core/filterRunner';
import { CHANNEL_LABELS, getChannelKeys, type RasterImage } from '../core/raster';
import { Modal } from './Modal';

type Props = {
  open: boolean;
  image: RasterImage | null;
  onPreview: (image: RasterImage | null) => void;
  onApply: (image: RasterImage) => void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
};

const toCells = (kernel: number[]) => kernel.map(String);

export function FilterDialog({ open, image, onPreview, onApply, onClose, onBusyChange }: Props) {
  const [presetId, setPresetId] = useState('identity');
  const [cells, setCells] = useState<string[]>(toCells(getPreset('identity').kernel));
  const [normalize, setNormalize] = useState(true);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [edge, setEdge] = useState<EdgeMode>('replicate');
  const [preview, setPreview] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const runnerRef = useRef(new FilterRunner());
  const cacheRef = useRef<{ key: string; result: RasterImage } | null>(null);

  const keys = useMemo(() => (image ? getChannelKeys(image) : []), [image]);

  const reset = () => {
    setPresetId('identity');
    setCells(toCells(getPreset('identity').kernel));
    setNormalize(true);
    setEdge('replicate');
    // по умолчанию — цветовые каналы; альфу (маску) пользователь включает сам
    setSelected(keys.map((k) => k !== 'alpha'));
  };

  useEffect(() => {
    if (open && image) {
      reset();
      setPreview(true);
      cacheRef.current = null;
    }
    if (!open) {
      runnerRef.current.cancel();
      setProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => onBusyChange(progress !== null), [progress, onBusyChange]);

  const kernel = cells.map((c) => Number(c));
  const valid = kernel.every(Number.isFinite) && cells.every((c) => c.trim() !== '');
  const divisor = normalize && valid ? kernelDivisor(kernel) : 1;
  const params: FilterParams = { kernel, divisor, edge, selected };
  const key = JSON.stringify(params);

  const run = async (target: RasterImage) => {
    setProgress(0);
    setError('');
    try {
      const result = await runnerRef.current.run(target, params, setProgress);
      cacheRef.current = { key, result };
      setProgress(null);
      return result;
    } catch (e) {
      if (!(e instanceof CancelledError)) {
        setError(e instanceof Error ? e.message : String(e));
        setProgress(null);
      }
      return null;
    }
  };

  // предпросмотр с задержкой, чтобы не запускать свёртку на каждое нажатие клавиши
  useEffect(() => {
    if (!open || !image || selected.length !== keys.length) return;
    if (!preview || !valid) {
      runnerRef.current.cancel();
      setProgress(null);
      onPreview(null);
      return;
    }
    if (cacheRef.current?.key === key) {
      onPreview(cacheRef.current.result);
      return;
    }
    const timer = window.setTimeout(async () => {
      const result = await run(image);
      if (result) onPreview(result);
    }, 150);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, image, key, preview, valid]);

  const apply = async () => {
    if (!image || !valid) return;
    const result = cacheRef.current?.key === key ? cacheRef.current.result : await run(image);
    if (result) onApply(result);
  };

  if (!image) return <Modal open={false} title="Фильтр" onClose={onClose}>{null}</Modal>;

  return (
    <Modal
      open={open}
      title="Фильтр: заказное ядро 3×3"
      width={520}
      onClose={onClose}
      footer={
        <>
          <label className="check">
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
            Предпросмотр
          </label>
          <span className="spacer" />
          <button type="button" className="btn" onClick={reset}>
            Сбросить
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="btn btn--primary" disabled={!valid || !selected.some(Boolean)} onClick={apply}>
            Применить
          </button>
        </>
      }
    >
      <label className="field">
        <span>Предустановка</span>
        <select
          value={presetId}
          onChange={(e) => {
            setPresetId(e.target.value);
            setCells(toCells(getPreset(e.target.value).kernel));
          }}
        >
          {KERNEL_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {presetId === 'custom' && <option value="custom">Пользовательское</option>}
        </select>
      </label>

      <div className="filter__layout">
        <div>
          <div className="kernel" role="group" aria-label="Ядро свёртки">
            {cells.map((value, i) => (
              <input
                key={i}
                type="text"
                inputMode="decimal"
                value={value}
                className={Number.isFinite(Number(value)) && value.trim() !== '' ? '' : 'invalid'}
                aria-label={`Ячейка ${Math.floor(i / 3) + 1}×${(i % 3) + 1}`}
                onChange={(e) => {
                  const next = [...cells];
                  next[i] = e.target.value.replace(',', '.');
                  setCells(next);
                  setPresetId('custom');
                }}
              />
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
            Нормировать (÷ {Number.isInteger(divisor) ? divisor : divisor.toFixed(3)})
          </label>
        </div>

        <div className="filter__options">
          <fieldset>
            <legend>Каналы</legend>
            {keys.map((k, i) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={selected[i] ?? false}
                  onChange={(e) => setSelected(selected.map((v, j) => (j === i ? e.target.checked : v)))}
                />
                {CHANNEL_LABELS[k]}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Края</legend>
            {(Object.keys(EDGE_MODE_LABELS) as EdgeMode[]).map((m) => (
              <label className="check" key={m}>
                <input type="radio" name="edge" checked={edge === m} onChange={() => setEdge(m)} />
                {EDGE_MODE_LABELS[m]}
              </label>
            ))}
          </fieldset>
        </div>
      </div>

      <div className="progress" aria-hidden={progress === null}>
        {progress !== null && (
          <>
            <div className="progress__bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            <span>Обработка… {Math.round(progress * 100)}%</span>
          </>
        )}
        {error && <span className="error">{error}</span>}
        {!valid && <span className="error">Все ячейки ядра должны быть числами.</span>}
      </div>
    </Modal>
  );
}
