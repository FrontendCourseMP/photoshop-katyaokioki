import { cloneRaster, colorMax, hasAlpha, isGray, luma, type RasterImage } from './raster';

/**
 * Каналы инструмента «Уровни».
 * master — все цветовые каналы сразу (для серого изображения это сам серый канал).
 */
export type LevelsChannel = 'master' | 'red' | 'green' | 'blue' | 'alpha';

export interface LevelParams {
  black: number;
  white: number;
  gamma: number;
}

export type LevelsSettings = Record<LevelsChannel, LevelParams>;

export const GAMMA_MIN = 0.1;
export const GAMMA_MAX = 9.9;

export const LEVELS_CHANNEL_LABELS: Record<LevelsChannel, string> = {
  master: 'Master',
  red: 'Красный',
  green: 'Зелёный',
  blue: 'Синий',
  alpha: 'Альфа'
};

/** Какие каналы доступны для данного изображения. */
export function getLevelsChannels(image: RasterImage): LevelsChannel[] {
  const list: LevelsChannel[] = isGray(image) ? ['master'] : ['master', 'red', 'green', 'blue'];
  if (hasAlpha(image)) list.push('alpha');
  return list;
}

/** Максимальное значение на оси гистограммы: 127 для GB7, 255 для 8 бит, альфа всегда 255. */
export function getLevelsMax(image: RasterImage, channel: LevelsChannel): number {
  return channel === 'alpha' ? 255 : colorMax(image);
}

export function defaultParams(max: number): LevelParams {
  return { black: 0, white: max, gamma: 1 };
}

export function createDefaultLevels(image: RasterImage): LevelsSettings {
  const cMax = colorMax(image);
  return {
    master: defaultParams(cMax),
    red: defaultParams(cMax),
    green: defaultParams(cMax),
    blue: defaultParams(cMax),
    alpha: defaultParams(255)
  };
}

export function isIdentity(p: LevelParams, max: number): boolean {
  return p.black === 0 && p.white === max && p.gamma === 1;
}

/** Ограничения: чёрная точка < белой, гамма в 0.1..9.9 */
export function normalizeParams(p: LevelParams, max: number): LevelParams {
  const black = Math.round(Math.min(Math.max(p.black, 0), max - 1));
  const white = Math.round(Math.min(Math.max(p.white, black + 1), max));
  const gamma = Math.min(Math.max(Number.isFinite(p.gamma) ? p.gamma : 1, GAMMA_MIN), GAMMA_MAX);
  return { black, white, gamma: Math.round(gamma * 100) / 100 };
}

/**
 * Положение маркера полутонов (0..1 между чёрной и белой точкой) ↔ гамма.
 * Значение m отображается в середину шкалы: m^(1/γ) = 0.5 ⇒ γ = log(m)/log(0.5).
 * Сдвиг маркера влево (m < 0.5) даёт γ > 1 — осветление, вправо — затемнение.
 */
export function gammaToMidpoint(gamma: number): number {
  return 0.5 ** gamma;
}

export function midpointToGamma(t: number): number {
  const clamped = Math.min(Math.max(t, 0.0001), 0.9999);
  return Math.min(Math.max(Math.log(clamped) / Math.log(0.5), GAMMA_MIN), GAMMA_MAX);
}

/** Таблица подстановки (LUT) для одного канала. */
export function buildLut(params: LevelParams, max: number): Uint8Array {
  const { black, white, gamma } = normalizeParams(params, max);
  const lut = new Uint8Array(max + 1);
  const range = white - black;
  const inv = 1 / gamma;

  for (let v = 0; v <= max; v += 1) {
    if (v <= black) lut[v] = 0;
    else if (v >= white) lut[v] = max;
    else lut[v] = Math.round(((v - black) / range) ** inv * max);
  }

  return lut;
}

/**
 * Применение уровней. Сначала таблица отдельного канала, затем общая (master).
 * Master не затрагивает альфа-канал. Исходный растр не изменяется.
 */
export function applyLevels(image: RasterImage, settings: LevelsSettings): RasterImage {
  const cMax = colorMax(image);
  const master = buildLut(settings.master, cMax);
  const result = cloneRaster(image);
  const { data, channels } = result;
  const alphaLut = hasAlpha(image) ? buildLut(settings.alpha, 255) : null;

  // объединяем таблицы канала и master в одну, чтобы было одно обращение на пиксель
  const combine = (lut: Uint8Array) => lut.map((v) => master[v]);
  const colorLuts = isGray(image)
    ? [master]
    : [combine(buildLut(settings.red, cMax)), combine(buildLut(settings.green, cMax)), combine(buildLut(settings.blue, cMax))];

  const colorCount = colorLuts.length;
  for (let i = 0; i < data.length; i += channels) {
    for (let c = 0; c < colorCount; c += 1) data[i + c] = colorLuts[c][data[i + c]];
    if (alphaLut) data[i + channels - 1] = alphaLut[data[i + channels - 1]];
  }

  return result;
}

/** Гистограмма: для master — светлота пикселя (Rec. 601), иначе значение канала. */
export function computeHistogram(image: RasterImage, channel: LevelsChannel): Uint32Array {
  const max = getLevelsMax(image, channel);
  const hist = new Uint32Array(max + 1);
  const { data, channels } = image;
  const gray = isGray(image);

  let offset = 0;
  if (channel === 'alpha') offset = channels - 1;
  else if (channel === 'green') offset = 1;
  else if (channel === 'blue') offset = 2;

  if (channel === 'master' && !gray) {
    for (let i = 0; i < data.length; i += channels) {
      hist[Math.round(luma(data[i], data[i + 1], data[i + 2]))] += 1;
    }
  } else {
    for (let i = offset; i < data.length; i += channels) hist[data[i]] += 1;
  }

  return hist;
}
