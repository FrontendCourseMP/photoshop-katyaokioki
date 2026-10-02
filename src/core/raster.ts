/**
 * Внутренняя модель изображения редактора.
 *
 * Пиксели хранятся построчно и чередуются по каналам (interleaved):
 *   1 канал  — Gray
 *   2 канала — Gray + Alpha
 *   3 канала — R G B
 *   4 канала — R G B A
 *
 * `bits` — разрядность цветовых каналов. Для PNG/JPG это 8 (значения 0..255),
 * для GB7 — 7 (значения 0..127). Альфа всегда хранится в диапазоне 0..255.
 * Благодаря этому все инструменты (уровни, фильтры, масштаб) работают
 * с реальным числом каналов и реальным диапазоном значений изображения.
 */
export type ChannelCount = 1 | 2 | 3 | 4;
export type ChannelKey = 'gray' | 'red' | 'green' | 'blue' | 'alpha';

export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export interface RasterImage {
  width: number;
  height: number;
  channels: ChannelCount;
  bits: number;
  data: Pixels;
}

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  gray: 'Серый',
  red: 'Красный',
  green: 'Зелёный',
  blue: 'Синий',
  alpha: 'Альфа'
};

export function createRaster(width: number, height: number, channels: ChannelCount, bits = 8): RasterImage {
  return { width, height, channels, bits, data: new Uint8ClampedArray(width * height * channels) };
}

export function cloneRaster(image: RasterImage, data: Pixels = new Uint8ClampedArray(image.data)): RasterImage {
  return { width: image.width, height: image.height, channels: image.channels, bits: image.bits, data };
}

export function isGray(image: Pick<RasterImage, 'channels'>): boolean {
  return image.channels <= 2;
}

export function hasAlpha(image: Pick<RasterImage, 'channels'>): boolean {
  return image.channels === 2 || image.channels === 4;
}

/** Список каналов в порядке их хранения в массиве. */
export function getChannelKeys(image: Pick<RasterImage, 'channels'>): ChannelKey[] {
  switch (image.channels) {
    case 1:
      return ['gray'];
    case 2:
      return ['gray', 'alpha'];
    case 3:
      return ['red', 'green', 'blue'];
    default:
      return ['red', 'green', 'blue', 'alpha'];
  }
}

/** Максимальное значение цветового канала: 127 для 7 бит, 255 для 8 бит. */
export function colorMax(image: Pick<RasterImage, 'bits'>): number {
  return (1 << image.bits) - 1;
}

/** Максимальное значение канала по его индексу в пикселе. */
export function channelMax(image: Pick<RasterImage, 'bits' | 'channels'>, channelIndex: number): number {
  const isAlpha = hasAlpha(image) && channelIndex === image.channels - 1;
  return isAlpha ? 255 : colorMax(image);
}

/** Светлота пикселя по формуле Rec. 601. */
export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Создание растра из ImageData браузера (всегда RGBA 8 бит)
 * с нужным количеством каналов.
 */
export function rasterFromImageData(imageData: ImageData, channels: ChannelCount): RasterImage {
  const { width, height, data } = imageData;
  const raster = createRaster(width, height, channels, 8);
  const out = raster.data;
  const count = width * height;

  for (let i = 0, s = 0, d = 0; i < count; i += 1, s += 4, d += channels) {
    const r = data[s];
    const g = data[s + 1];
    const b = data[s + 2];
    const a = data[s + 3];

    if (channels <= 2) {
      out[d] = r === g && g === b ? r : Math.round(luma(r, g, b));
      if (channels === 2) out[d + 1] = a;
    } else {
      out[d] = r;
      out[d + 1] = g;
      out[d + 2] = b;
      if (channels === 4) out[d + 3] = a;
    }
  }

  return raster;
}

/** Определение, какие каналы реально нужны изображению (для форматов без заголовка). */
export function detectChannels(imageData: ImageData): ChannelCount {
  const { data } = imageData;
  let gray = true;
  let alpha = false;

  for (let i = 0; i < data.length; i += 4) {
    if (gray && (data[i] !== data[i + 1] || data[i + 1] !== data[i + 2])) gray = false;
    if (!alpha && data[i + 3] !== 255) alpha = true;
    if (!gray && alpha) break;
  }

  if (gray) return alpha ? 2 : 1;
  return alpha ? 4 : 3;
}

/** Преобразование в RGBA 8 бит для вывода в canvas / сохранения через браузер. */
export function rasterToImageData(image: RasterImage): ImageData {
  return composeForDisplay(image, null);
}

export type ChannelVisibility = Partial<Record<ChannelKey, boolean>>;

/**
 * Сборка изображения для показа с учётом включённых каналов.
 * Исходный массив пикселей не изменяется — создаётся новый.
 * Если включена только альфа, показывается маска прозрачности в градациях серого.
 */
export function composeForDisplay(image: RasterImage, visibility: ChannelVisibility | null): ImageData {
  const { width, height, channels, data } = image;
  const out = new Uint8ClampedArray(width * height * 4);
  const scale = 255 / colorMax(image);
  const count = width * height;
  const on = (key: ChannelKey) => (visibility ? visibility[key] !== false : true);

  const alphaPresent = hasAlpha(image);
  const alphaOn = alphaPresent && on('alpha');

  if (channels <= 2) {
    const grayOn = on('gray');
    for (let i = 0, s = 0, d = 0; i < count; i += 1, s += channels, d += 4) {
      const a = alphaPresent ? data[s + 1] : 255;
      if (grayOn) {
        const v = Math.round(data[s] * scale);
        out[d] = v;
        out[d + 1] = v;
        out[d + 2] = v;
        out[d + 3] = alphaOn ? a : 255;
      } else {
        // только альфа — маска
        const v = alphaOn ? a : 0;
        out[d] = v;
        out[d + 1] = v;
        out[d + 2] = v;
        out[d + 3] = 255;
      }
    }
    return new ImageData(out, width, height);
  }

  const rOn = on('red');
  const gOn = on('green');
  const bOn = on('blue');
  const anyColor = rOn || gOn || bOn;

  for (let i = 0, s = 0, d = 0; i < count; i += 1, s += channels, d += 4) {
    const a = alphaPresent ? data[s + 3] : 255;
    if (anyColor) {
      out[d] = rOn ? Math.round(data[s] * scale) : 0;
      out[d + 1] = gOn ? Math.round(data[s + 1] * scale) : 0;
      out[d + 2] = bOn ? Math.round(data[s + 2] * scale) : 0;
      out[d + 3] = alphaOn ? a : 255;
    } else {
      const v = alphaOn ? a : 0;
      out[d] = v;
      out[d + 1] = v;
      out[d + 2] = v;
      out[d + 3] = 255;
    }
  }

  return new ImageData(out, width, height);
}

/**
 * Миниатюра одного канала в градациях серого
 * (белый — максимальная интенсивность, чёрный — отсутствие).
 */
export function createChannelThumbnail(image: RasterImage, key: ChannelKey): ImageData {
  const keys = getChannelKeys(image);
  const index = keys.indexOf(key);
  const { width, height, channels, data } = image;
  const out = new Uint8ClampedArray(width * height * 4);
  const scale = 255 / channelMax(image, index);

  for (let s = index, d = 0; d < out.length; s += channels, d += 4) {
    const v = Math.round(data[s] * scale);
    out[d] = v;
    out[d + 1] = v;
    out[d + 2] = v;
    out[d + 3] = 255;
  }

  return new ImageData(out, width, height);
}

/** Значение пикселя в RGB 0..255 (для пипетки). */
export function readPixel(image: RasterImage, x: number, y: number) {
  const { channels, data } = image;
  const offset = (y * image.width + x) * channels;
  const scale = 255 / colorMax(image);
  const raw = Array.from(data.subarray(offset, offset + channels));

  if (channels <= 2) {
    const v = Math.round(data[offset] * scale);
    return { r: v, g: v, b: v, alpha: channels === 2 ? data[offset + 1] : null, raw };
  }

  return {
    r: Math.round(data[offset] * scale),
    g: Math.round(data[offset + 1] * scale),
    b: Math.round(data[offset + 2] * scale),
    alpha: channels === 4 ? data[offset + 3] : null,
    raw
  };
}
