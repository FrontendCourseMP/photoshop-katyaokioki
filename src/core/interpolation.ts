import { createRaster, type RasterImage } from './raster';

/**
 * Интерполяторы. Каждый метод получает для каждого столбца/строки результата
 * координату в исходном изображении (непрерывную: пиксель i занимает [i, i+1),
 * центр — i + 0.5) и заполняет выходной буфер.
 *
 * Один и тот же интерфейс используется и для изменения размера изображения,
 * и для отрисовки на холсте с масштабом. Чтобы добавить новый метод,
 * достаточно описать объект Interpolator и добавить его в INTERPOLATORS.
 */
export interface PixelBuffer {
  width: number;
  height: number;
  channels: number;
  data: Uint8ClampedArray;
}

export interface Interpolator {
  id: string;
  name: string;
  description: string;
  resample(src: PixelBuffer, dst: PixelBuffer, xs: Float64Array, ys: Float64Array): void;
}

const clampInt = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);

export const nearestNeighbor: Interpolator = {
  id: 'nearest',
  name: 'Ближайший сосед',
  description:
    'Берёт значение ближайшего пикселя. Очень быстрый, сохраняет резкие границы и точные значения — хорош для пиксель-арта и масок, но даёт «лесенку» при увеличении.',
  resample(src, dst, xs, ys) {
    const ch = src.channels;
    const sx = new Int32Array(dst.width);
    for (let x = 0; x < dst.width; x += 1) sx[x] = clampInt(Math.floor(xs[x]), src.width - 1) * ch;

    let d = 0;
    for (let y = 0; y < dst.height; y += 1) {
      const row = clampInt(Math.floor(ys[y]), src.height - 1) * src.width * ch;
      for (let x = 0; x < dst.width; x += 1) {
        const s = row + sx[x];
        for (let c = 0; c < ch; c += 1) dst.data[d++] = src.data[s + c];
      }
    }
  }
};

export const bilinear: Interpolator = {
  id: 'bilinear',
  name: 'Билинейная',
  description:
    'Взвешенно смешивает 4 соседних пикселя (линейно по X, затем по Y). Даёт плавные переходы без «лесенки», но немного размывает мелкие детали.',
  resample(src, dst, xs, ys) {
    const ch = src.channels;
    const w = dst.width;
    const x0 = new Int32Array(w);
    const x1 = new Int32Array(w);
    const tx = new Float64Array(w);

    for (let x = 0; x < w; x += 1) {
      const fx = xs[x] - 0.5;
      const ix = Math.floor(fx);
      tx[x] = fx - ix;
      x0[x] = clampInt(ix, src.width - 1) * ch;
      x1[x] = clampInt(ix + 1, src.width - 1) * ch;
    }

    const stride = src.width * ch;
    const data = src.data;
    let d = 0;

    for (let y = 0; y < dst.height; y += 1) {
      const fy = ys[y] - 0.5;
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const r0 = clampInt(iy, src.height - 1) * stride;
      const r1 = clampInt(iy + 1, src.height - 1) * stride;

      for (let x = 0; x < w; x += 1) {
        const a = r0 + x0[x];
        const b = r0 + x1[x];
        const c0 = r1 + x0[x];
        const c1 = r1 + x1[x];
        const t = tx[x];
        for (let c = 0; c < ch; c += 1) {
          const top = data[a + c] + (data[b + c] - data[a + c]) * t;
          const bottom = data[c0 + c] + (data[c1 + c] - data[c0 + c]) * t;
          dst.data[d++] = top + (bottom - top) * ty + 0.5; // Uint8ClampedArray округляет и ограничивает
        }
      }
    }
  }
};

export const INTERPOLATORS = [bilinear, nearestNeighbor] as const;
export type InterpolationMode = (typeof INTERPOLATORS)[number]['id'];
export const DEFAULT_INTERPOLATION: InterpolationMode = 'bilinear';

export function getInterpolator(id: string): Interpolator {
  return INTERPOLATORS.find((item) => item.id === id) ?? bilinear;
}

/** Изменение размера изображения выбранным методом (каналы и битность сохраняются). */
export function resizeRaster(image: RasterImage, width: number, height: number, mode: string = DEFAULT_INTERPOLATION): RasterImage {
  const result = createRaster(width, height, image.channels, image.bits);
  const xs = new Float64Array(width);
  const ys = new Float64Array(height);
  const kx = image.width / width;
  const ky = image.height / height;
  for (let x = 0; x < width; x += 1) xs[x] = (x + 0.5) * kx;
  for (let y = 0; y < height; y += 1) ys[y] = (y + 0.5) * ky;
  getInterpolator(mode).resample(image, result, xs, ys);
  return result;
}

/**
 * Отрисовка видимой части изображения с масштабом `scale`.
 * originX/originY — где на холсте находится левый верхний угол изображения.
 * Возвращает только пересечение изображения с холстом, чтобы не создавать
 * огромных буферов при большом увеличении.
 */
export function renderViewport(
  rgba: ImageData,
  scale: number,
  originX: number,
  originY: number,
  viewWidth: number,
  viewHeight: number,
  mode: string
): { image: ImageData; x: number; y: number } | null {
  const left = Math.max(0, Math.floor(originX));
  const top = Math.max(0, Math.floor(originY));
  const right = Math.min(viewWidth, Math.ceil(originX + rgba.width * scale));
  const bottom = Math.min(viewHeight, Math.ceil(originY + rgba.height * scale));
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return null;

  const xs = new Float64Array(w);
  const ys = new Float64Array(h);
  for (let x = 0; x < w; x += 1) xs[x] = (left + x + 0.5 - originX) / scale;
  for (let y = 0; y < h; y += 1) ys[y] = (top + y + 0.5 - originY) / scale;

  const out = new ImageData(w, h);
  getInterpolator(mode).resample(
    { width: rgba.width, height: rgba.height, channels: 4, data: rgba.data },
    { width: w, height: h, channels: 4, data: out.data },
    xs,
    ys
  );

  return { image: out, x: left, y: top };
}
