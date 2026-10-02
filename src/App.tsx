import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChannelPanel } from './components/ChannelPanel';
import { FilterDialog } from './components/FilterDialog';
import { InfoPanel, type PickedColor } from './components/InfoPanel';
import { LevelsDialog } from './components/LevelsDialog';
import { MenuBar, type Menu } from './components/MenuBar';
import { ResizeDialog } from './components/ResizeDialog';
import { StatusBar } from './components/StatusBar';
import { Workspace, clampPercent, type Tool, type ViewState } from './components/Workspace';
import { rgbToLab } from './core/color';
import { encodeImage, loadImageFile, type SaveFormat } from './core/formats';
import { DEFAULT_INTERPOLATION, getInterpolator, resizeRaster } from './core/interpolation';
import { composeForDisplay, getChannelKeys, readPixel, type ChannelKey, type ChannelVisibility, type RasterImage } from './core/raster';
import { useImageStore } from './store/imageStore';

type DialogId = 'levels' | 'filter' | 'resize' | null;

/** Отступ от краёв окна при начальном вписывании изображения. */
const FIT_MARGIN = 50;

function fitView(image: RasterImage, viewport: { width: number; height: number }): ViewState {
  const kx = (viewport.width - FIT_MARGIN * 2) / image.width;
  const ky = (viewport.height - FIT_MARGIN * 2) / image.height;
  const percent = clampPercent(Math.floor(Math.min(kx, ky) * 100));
  return { percent, cx: image.width / 2, cy: image.height / 2 };
}

const TOOLS: { id: Tool; label: string; key: string; icon: JSX.Element }[] = [
  {
    id: 'hand',
    label: 'Рука — перемещение вида',
    key: 'H',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" />
        <path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
    )
  },
  {
    id: 'eyedropper',
    label: 'Пипетка',
    key: 'I',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m2 22 1-1h3l9-9" />
        <path d="M3 21v-3l9-9" />
        <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
      </svg>
    )
  }
];

export default function App() {
  const { image, original, fileName, info, open, setImage, revert } = useImageStore();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef({ width: 800, height: 600 });

  const [view, setView] = useState<ViewState>({ percent: 100, cx: 0, cy: 0 });
  const [interpolation, setInterpolation] = useState<string>(DEFAULT_INTERPOLATION);
  const [visibility, setVisibility] = useState<ChannelVisibility>({});
  const [tool, setTool] = useState<Tool>('hand');
  const [picked, setPicked] = useState<PickedColor | null>(null);
  const [dialog, setDialog] = useState<DialogId>(null);
  const [preview, setPreview] = useState<RasterImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Откройте изображение: Файл → Открыть или перетащите файл в окно');

  // то, что сейчас показывается: предпросмотр инструмента или текущее изображение
  const displayed = preview ?? image;
  const rgba = useMemo(() => (displayed ? composeForDisplay(displayed, visibility) : null), [displayed, visibility]);

  const handleViewportResize = useCallback((size: { width: number; height: number }) => {
    viewportRef.current = size;
  }, []);

  const openFile = async (file: File) => {
    try {
      const loaded = await loadImageFile(file);
      open(loaded.raster, file.name, loaded.info);
      setVisibility({});
      setPicked(null);
      setPreview(null);
      const nextView = fitView(loaded.raster, viewportRef.current);
      setView(nextView);
      setMessage(`Открыт файл ${file.name}`);
    } catch (error) {
      console.error(error);
      setMessage(`Ошибка: ${error instanceof Error ? error.message : 'не удалось открыть файл'}`);
    }
  };

  const save = async (format: SaveFormat) => {
    if (!image) return;
    try {
      const blob = await encodeImage(image, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.[^.]+$/, '') || 'image'}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`Сохранено: ${a.download}`);
    } catch (error) {
      setMessage(`Ошибка сохранения: ${error instanceof Error ? error.message : error}`);
    }
  };

  const toggleChannel = (key: ChannelKey) => {
    if (!image) return;
    const keys = getChannelKeys(image);
    const next = { ...visibility, [key]: visibility[key] === false };
    if (keys.every((k) => next[k] === false)) {
      setMessage('Хотя бы один канал должен быть включён');
      return;
    }
    setVisibility(next);
  };

  const pick = (x: number, y: number) => {
    if (!displayed) return;
    const p = readPixel(displayed, x, y);
    setPicked({ x, y, r: p.r, g: p.g, b: p.b, alpha: p.alpha, raw: p.raw, bits: displayed.bits, lab: rgbToLab(p) });
  };

  const closeDialog = useCallback(() => {
    setDialog(null);
    setPreview(null);
  }, []);

  const applyResult = (result: RasterImage, text: string) => {
    setImage(result);
    setPreview(null);
    setDialog(null);
    setMessage(text);
  };

  const applyResize = (width: number, height: number, mode: string) => {
    if (!image) return;
    const resized = resizeRaster(image, width, height, mode);
    setImage(resized);
    setDialog(null);
    // масштаб в строке состояния сохраняется, изображение центрируется
    setView((v) => ({ ...v, cx: width / 2, cy: height / 2 }));
    setMessage(`Размер изменён: ${image.width}×${image.height} → ${width}×${height} (${getInterpolator(mode).name})`);
  };

  const zoomTo = (percent: number) => setView((v) => ({ ...v, percent: clampPercent(percent) }));

  // горячие клавиши
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (dialog || target.closest('input, select, textarea')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        inputRef.current?.click();
        return;
      }
      if (!image || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'h' || key === 'р') setTool('hand');
      if (key === 'i' || key === 'ш') setTool('eyedropper');
      if (event.key === '+' || event.key === '=') zoomTo(view.percent * 1.25);
      if (event.key === '-') zoomTo(view.percent / 1.25);
      if (event.key === '0') setView(fitView(image, viewportRef.current));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, image, view.percent]);

  const noImage = !image;
  const menus: Menu[] = [
    {
      label: 'Файл',
      items: [
        { label: 'Открыть…', shortcut: 'Ctrl+O', onSelect: () => inputRef.current?.click() },
        { label: 'Сохранить как PNG', disabled: noImage, onSelect: () => save('png'), separatorBefore: true },
        { label: 'Сохранить как JPG', disabled: noImage, onSelect: () => save('jpg') },
        { label: 'Сохранить как GB7', disabled: noImage, onSelect: () => save('gb7') },
        {
          label: 'Вернуть исходное',
          disabled: noImage || image === original,
          separatorBefore: true,
          onSelect: () => {
            revert();
            if (original) setView((v) => ({ ...v, cx: original.width / 2, cy: original.height / 2 }));
            setMessage('Восстановлено исходное изображение');
          }
        }
      ]
    },
    {
      label: 'Изображение',
      items: [
        { label: 'Уровни…', disabled: noImage, onSelect: () => setDialog('levels') },
        { label: 'Фильтр (ядро 3×3)…', disabled: noImage, onSelect: () => setDialog('filter') },
        { label: 'Размер изображения…', disabled: noImage, onSelect: () => setDialog('resize'), separatorBefore: true }
      ]
    },
    {
      label: 'Вид',
      items: [
        { label: 'Вписать в окно', shortcut: '0', disabled: noImage, onSelect: () => image && setView(fitView(image, viewportRef.current)) },
        { label: 'Реальный размер (100%)', disabled: noImage, onSelect: () => zoomTo(100) },
        { label: 'Увеличить', shortcut: '+', disabled: noImage, onSelect: () => zoomTo(view.percent * 1.25) },
        { label: 'Уменьшить', shortcut: '−', disabled: noImage, onSelect: () => zoomTo(view.percent / 1.25) }
      ]
    }
  ];

  return (
    <div className="app">
      <MenuBar menus={menus} title={image ? `${fileName} @ ${view.percent}%` : 'Графический редактор'} />

      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.gb7,image/png,image/jpeg"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openFile(file);
          e.target.value = '';
        }}
      />

      <aside className="toolbox" aria-label="Инструменты">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool${tool === t.id ? ' tool--active' : ''}`}
            title={`${t.label} (${t.key})`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            disabled={noImage}
            onClick={() => setTool(t.id)}
          >
            {t.icon}
          </button>
        ))}
      </aside>

      <main className="main">
        <Workspace
          rgba={rgba}
          view={view}
          interpolation={interpolation}
          tool={tool}
          busy={busy}
          onViewChange={setView}
          onViewportResize={handleViewportResize}
          onPick={pick}
          onFileDrop={(file) => void openFile(file)}
          onOpenClick={() => inputRef.current?.click()}
        />
      </main>

      <aside className="sidebar">
        {image ? (
          <ChannelPanel image={displayed ?? image} visibility={visibility} onToggle={toggleChannel} />
        ) : (
          <section className="panel">
            <h3 className="panel__title">Каналы</h3>
            <p className="muted panel__hint">Нет изображения</p>
          </section>
        )}
        <InfoPanel picked={picked} active={tool === 'eyedropper'} />
      </aside>

      <StatusBar
        fileName={fileName}
        info={info}
        width={image?.width ?? null}
        height={image?.height ?? null}
        message={message}
        percent={view.percent}
        interpolation={interpolation}
        onPercentChange={zoomTo}
        onFit={() => image && setView(fitView(image, viewportRef.current))}
        onInterpolationChange={setInterpolation}
      />

      <LevelsDialog
        open={dialog === 'levels'}
        image={image}
        onPreview={setPreview}
        onApply={(result) => applyResult(result, 'Уровни применены')}
        onClose={closeDialog}
      />
      <FilterDialog
        open={dialog === 'filter'}
        image={image}
        onPreview={setPreview}
        onApply={(result) => applyResult(result, 'Фильтр применён')}
        onClose={closeDialog}
        onBusyChange={setBusy}
      />
      <ResizeDialog
        open={dialog === 'resize'}
        width={image?.width ?? 1}
        height={image?.height ?? 1}
        onApply={applyResize}
        onClose={closeDialog}
      />
    </div>
  );
}
