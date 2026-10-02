/**
 * Фильтрация изображения свёрткой с ядром 3×3.
 * Модуль не зависит от DOM, поэтому используется и в Web Worker.
 */
export type EdgeMode = 'black' | 'white' | 'replicate';
export type Kernel = number[]; // 9 значений построчно

export interface KernelPreset {
  id: string;
  name: string;
  kernel: Kernel;
}

export const KERNEL_PRESETS: KernelPreset[] = [
  { id: 'identity', name: 'Тождественное отображение', kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0] },
  { id: 'sharpen', name: 'Повышение резкости', kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0] },
  { id: 'gaussian', name: 'Фильтр Гаусса 3×3', kernel: [1, 2, 1, 2, 4, 2, 1, 2, 1] },
  { id: 'box', name: 'Прямоугольное размытие', kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { id: 'prewitt-x', name: 'Оператор Прюитта (горизонтальный)', kernel: [-1, 0, 1, -1, 0, 1, -1, 0, 1] },
  { id: 'prewitt-y', name: 'Оператор Прюитта (вертикальный)', kernel: [-1, -1, -1, 0, 0, 0, 1, 1, 1] }
];

export const EDGE_MODE_LABELS: Record<EdgeMode, string> = {
  black: 'Заполнение чёрным',
  white: 'Заполнение белым',
  replicate: 'Копирование края'
};

export function getPreset(id: string): KernelPreset {
  return KERNEL_PRESETS.find((p) => p.id === id) ?? KERNEL_PRESETS[0];
}

/**
 * Делитель для нормировки: сумма коэффициентов (чтобы размытие не меняло яркость),
 * а если сумма равна 0 (операторы выделения границ) — 1.
 */
export function kernelDivisor(kernel: Kernel): number {
  const sum = kernel.reduce((acc, v) => acc + v, 0);
  return Math.abs(sum) < 1e-9 ? 1 : sum;
}

export interface ConvolutionJob {
  width: number;
  height: number;
  channels: number;
  data: Uint8ClampedArray;
  /** максимальное значение для каждого канала (127/255) — для «белого» края и ограничения */
  maxValues: number[];
  /** к каким каналам применять */
  selected: boolean[];
  kernel: Kernel;
  divisor: number;
  edge: EdgeMode;
}

/**
 * Расширение одного канала на 1 пиксель с каждой стороны по выбранной стратегии.
 * Возвращает буфер размером (w + 2) × (h + 2).
 */
export function padChannel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
  channel: number,
  edge: EdgeMode,
  max: number
): Uint16Array {
  const pw = width + 2;
  const ph = height + 2;
  const padded = new Uint16Array(pw * ph);
  const fill = edge === 'white' ? max : 0;

  if (edge !== 'replicate') padded.fill(fill);

  for (let y = 0; y < ph; y += 1) {
    const isInnerRow = y >= 1 && y <= height;
    if (edge !== 'replicate' && !isInnerRow) continue;
    const sy = Math.min(Math.max(y - 1, 0), height - 1);

    for (let x = 0; x < pw; x += 1) {
      const isInnerCol = x >= 1 && x <= width;
      if (edge !== 'replicate' && !isInnerCol) continue;
      const sx = Math.min(Math.max(x - 1, 0), width - 1);
      padded[y * pw + x] = data[(sy * width + sx) * channels + channel];
    }
  }

  return padded;
}

/**
 * Свёртка. onRow вызывается после каждой строки (для прогресса и
 * кооперативной многозадачности).
 */
export function convolve(job: ConvolutionJob, onRow?: (done: number, total: number) => void): Uint8ClampedArray<ArrayBuffer> {
  const { width, height, channels, data, kernel, divisor, edge, selected, maxValues } = job;
  const out = new Uint8ClampedArray(data); // невыбранные каналы остаются как были
  const pw = width + 2;
  const k = kernel;
  const active = selected.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const total = active.length * height;
  let done = 0;

  for (const c of active) {
    const p = padChannel(data, width, height, channels, c, edge, maxValues[c]);
    const max = maxValues[c];

    for (let y = 0; y < height; y += 1) {
      const r0 = y * pw;
      const r1 = r0 + pw;
      const r2 = r1 + pw;
      for (let x = 0; x < width; x += 1) {
        const acc =
          p[r0 + x] * k[0] + p[r0 + x + 1] * k[1] + p[r0 + x + 2] * k[2] +
          p[r1 + x] * k[3] + p[r1 + x + 1] * k[4] + p[r1 + x + 2] * k[5] +
          p[r2 + x] * k[6] + p[r2 + x + 1] * k[7] + p[r2 + x + 2] * k[8];
        const v = Math.round(acc / divisor);
        out[(y * width + x) * channels + c] = v < 0 ? 0 : v > max ? max : v;
      }
      done += 1;
      onRow?.(done, total);
    }
  }

  return out;
}
