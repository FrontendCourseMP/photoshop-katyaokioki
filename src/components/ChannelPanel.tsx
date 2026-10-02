import { useMemo } from 'react';
import { resizeRaster } from '../core/interpolation';
import { CHANNEL_LABELS, createChannelThumbnail, getChannelKeys, type ChannelKey, type ChannelVisibility, type RasterImage } from '../core/raster';

const THUMB = 48;

function toDataUrl(image: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

type Props = {
  image: RasterImage;
  visibility: ChannelVisibility;
  onToggle: (key: ChannelKey) => void;
};

/**
 * Панель каналов: миниатюра каждого канала в градациях серого
 * (белый — максимум, чёрный — отсутствие), клик включает/выключает канал.
 */
export function ChannelPanel({ image, visibility, onToggle }: Props) {
  const keys = getChannelKeys(image);

  const thumbs = useMemo(() => {
    // уменьшаем один раз с сохранением пропорций
    const k = Math.min(1, THUMB / Math.max(image.width, image.height));
    const small = resizeRaster(image, Math.max(1, Math.round(image.width * k)), Math.max(1, Math.round(image.height * k)), 'bilinear');
    return Object.fromEntries(getChannelKeys(image).map((key) => [key, toDataUrl(createChannelThumbnail(small, key))]));
  }, [image]);

  return (
    <section className="panel">
      <h3 className="panel__title">
        Каналы <span className="muted">· {keys.length}</span>
      </h3>
      <ul className="channels">
        {keys.map((key) => {
          const enabled = visibility[key] !== false;
          return (
            <li key={key}>
              <button
                type="button"
                className={`channel${enabled ? ' channel--on' : ''}`}
                aria-pressed={enabled}
                onClick={() => onToggle(key)}
                title={enabled ? 'Скрыть канал' : 'Показать канал'}
              >
                <span className="channel__eye" aria-hidden>
                  {enabled && (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </span>
                <span className="channel__thumb">
                  <img src={thumbs[key]} alt="" />
                </span>
                <span className={`channel__name channel__name--${key}`}>{CHANNEL_LABELS[key]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
