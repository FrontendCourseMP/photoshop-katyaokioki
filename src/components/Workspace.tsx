import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type PointerEvent, type WheelEvent } from 'react';
import { renderViewport } from '../core/interpolation';

export type Tool = 'hand' | 'eyedropper';

/** Состояние вида: масштаб в процентах и точка изображения в центре холста. */
export interface ViewState {
  percent: number;
  cx: number;
  cy: number;
}

export const MIN_PERCENT = 12;
export const MAX_PERCENT = 300;
export const clampPercent = (p: number) => Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, Math.round(p)));

type Props = {
  rgba: ImageData | null;
  view: ViewState;
  interpolation: string;
  tool: Tool;
  busy?: boolean;
  onViewChange: (view: ViewState) => void;
  onViewportResize: (size: { width: number; height: number }) => void;
  onPick: (x: number, y: number) => void;
  onFileDrop: (file: File) => void;
  onOpenClick: () => void;
};

function createChecker(ctx: CanvasRenderingContext2D) {
  const tile = document.createElement('canvas');
  tile.width = 16;
  tile.height = 16;
  const t = tile.getContext('2d')!;
  t.fillStyle = '#ffffff';
  t.fillRect(0, 0, 16, 16);
  t.fillStyle = '#d6d6d6';
  t.fillRect(0, 0, 8, 8);
  t.fillRect(8, 8, 8, 8);
  return ctx.createPattern(tile, 'repeat');
}

/**
 * Рабочая область. Холст всегда занимает всё доступное место,
 * изображение рисуется в центре с выбранным масштабом с помощью
 * собственной интерполяции (renderViewport).
 */
export function Workspace({ rgba, view, interpolation, tool, busy, onViewChange, onViewportResize, onPick, onFileDrop, onOpenClick }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dragOver, setDragOver] = useState(false);
  const panRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  // размер холста = размер рабочей области
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      const next = { width: Math.floor(wrap.clientWidth), height: Math.floor(wrap.clientHeight) };
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width > 0 && size.height > 0) onViewportResize(size);
  }, [size, onViewportResize]);

  const scale = view.percent / 100;
  const originX = Math.round(size.width / 2 - view.cx * scale);
  const originY = Math.round(size.height / 2 - view.cy * scale);

  // отрисовка (через requestAnimationFrame, чтобы не перерисовывать чаще кадра)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;

    const frame = requestAnimationFrame(() => {
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, size.width, size.height);
      if (!rgba) return;

      const region = renderViewport(rgba, scale, originX, originY, size.width, size.height, interpolation);
      if (!region) return;

      // шахматка под прозрачными пикселями
      ctx.fillStyle = createChecker(ctx) ?? '#fff';
      ctx.fillRect(region.x, region.y, region.image.width, region.image.height);

      const off = offscreenRef.current ?? (offscreenRef.current = document.createElement('canvas'));
      off.width = region.image.width;
      off.height = region.image.height;
      off.getContext('2d')!.putImageData(region.image, 0, 0);
      ctx.drawImage(off, region.x, region.y); // без масштабирования — только наложение по альфе
    });

    return () => cancelAnimationFrame(frame);
  }, [rgba, scale, originX, originY, size, interpolation]);

  /** координаты холста → координаты пикселя изображения */
  const toImage = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (canvasRef.current!.width / rect.width);
    const py = (event.clientY - rect.top) * (canvasRef.current!.height / rect.height);
    return { px, py, x: (px - originX) / scale, y: (py - originY) / scale };
  };

  const clampCenter = (cx: number, cy: number) => ({
    cx: Math.min(Math.max(cx, 0), rgba?.width ?? 0),
    cy: Math.min(Math.max(cy, 0), rgba?.height ?? 0)
  });

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!rgba) return;
    if (tool === 'eyedropper' && event.button === 0) {
      const { x, y } = toImage(event);
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix >= 0 && iy >= 0 && ix < rgba.width && iy < rgba.height) onPick(ix, iy);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    if (!pan) return;
    const next = clampCenter(pan.cx - (event.clientX - pan.x) / scale, pan.cy - (event.clientY - pan.y) / scale);
    onViewChange({ ...view, ...next });
  };

  const handlePointerUp = () => {
    panRef.current = null;
  };

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (!rgba) return;
    if (event.ctrlKey || event.metaKey) {
      // масштаб относительно точки под курсором
      const percent = clampPercent(view.percent * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
      const { px, py, x, y } = toImage(event);
      const s = percent / 100;
      const next = clampCenter(x - (px - size.width / 2) / s, y - (py - size.height / 2) / s);
      onViewChange({ percent, ...next });
    } else {
      const dx = event.shiftKey ? event.deltaY : event.deltaX;
      const dy = event.shiftKey ? 0 : event.deltaY;
      onViewChange({ ...view, ...clampCenter(view.cx + dx / scale, view.cy + dy / scale) });
    }
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFileDrop(file);
  };

  return (
    <div
      ref={wrapRef}
      className={`workspace${dragOver ? ' workspace--drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className="workspace__canvas"
        data-tool={tool}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      />
      {!rgba && (
        <div className="workspace__empty">
          <p>Перетащите сюда PNG, JPG или GB7</p>
          <button type="button" className="btn btn--primary" onClick={onOpenClick}>
            Открыть файл…
          </button>
        </div>
      )}
      {busy && <div className="workspace__busy">Обработка…</div>}
    </div>
  );
}
