export const LEVEL_CHANNELS = ['master', 'red', 'green', 'blue', 'alpha'] as const;
export type LevelsChannel = (typeof LEVEL_CHANNELS)[number];

export type LevelPreset = {
  black: number;
  white: number;
  gamma: number;
};

export type LevelsSettings = Record<LevelsChannel, LevelPreset>;

export function createDefaultLevels(maxValue = 255): LevelsSettings {
  return {
    master: { black: 0, white: maxValue, gamma: 1 },
    red: { black: 0, white: maxValue, gamma: 1 },
    green: { black: 0, white: maxValue, gamma: 1 },
    blue: { black: 0, white: maxValue, gamma: 1 },
    alpha: { black: 0, white: maxValue, gamma: 1 }
  };
}

export function normalizeLevelConfig(value: LevelPreset, maxValue: number): LevelPreset {
  const black = Math.max(0, Math.min(maxValue, Number(value.black) || 0));
  const white = Math.max(black + 1, Math.min(maxValue, Number(value.white) || maxValue));
  const gamma = Math.max(0.1, Math.min(9.9, Number(value.gamma) || 1));

  return { black, white, gamma };
}

export function getChannelValue(channel: LevelsChannel, r: number, g: number, b: number, a: number): number {
  switch (channel) {
    case 'red':
      return r;
    case 'green':
      return g;
    case 'blue':
      return b;
    case 'alpha':
      return a;
    case 'master':
    default:
      return Math.round((r + g + b) / 3);
  }
}

export function createLevelLut(config: LevelPreset, maxValue: number): Uint16Array {
  const black = Math.max(0, Math.min(maxValue, Math.round(config.black || 0)));
  const white = Math.max(black + 1, Math.min(maxValue, Math.round(config.white || maxValue)));
  const gamma = Math.max(0.1, Math.min(9.9, Number(config.gamma) || 1));
  const lut = new Uint16Array(maxValue + 1);

  for (let value = 0; value <= maxValue; value += 1) {
    if (value <= black) {
      lut[value] = 0;
      continue;
    }

    if (value >= white) {
      lut[value] = maxValue;
      continue;
    }

    const normalized = (value - black) / (white - black || 1);
    const adjusted = Math.pow(Math.max(0, Math.min(1, normalized)), 1 / gamma);
    lut[value] = Math.round(adjusted * maxValue);
  }

  return lut;
}

export function transformLevelValue(value: number, config: LevelPreset, maxValue: number): number {
  const lut = createLevelLut(config, maxValue);
  const clamped = Math.max(0, Math.min(maxValue, Math.round(value)));
  return lut[clamped];
}

export function applyLevelsToImageData(
  imageData: ImageData,
  settings: LevelsSettings,
  activeChannel: LevelsChannel,
  maxValue = 255
): ImageData {
  const output = new Uint8ClampedArray(imageData.data.length);
  const { data, width, height } = imageData;

  const masterLut = createLevelLut(normalizeLevelConfig(settings.master, maxValue), maxValue);
  const redLut = createLevelLut(normalizeLevelConfig(settings.red, maxValue), maxValue);
  const greenLut = createLevelLut(normalizeLevelConfig(settings.green, maxValue), maxValue);
  const blueLut = createLevelLut(normalizeLevelConfig(settings.blue, maxValue), maxValue);
  const alphaLut = createLevelLut(normalizeLevelConfig(settings.alpha, maxValue), maxValue);

  for (let i = 0; i < data.length; i += 4) {
    let r = masterLut[data[i]];
    let g = masterLut[data[i + 1]];
    let b = masterLut[data[i + 2]];
    let a = masterLut[data[i + 3] ?? 255];

    if (activeChannel === 'red') {
      r = redLut[r];
    } else if (activeChannel === 'green') {
      g = greenLut[g];
    } else if (activeChannel === 'blue') {
      b = blueLut[b];
    } else if (activeChannel === 'alpha') {
      a = alphaLut[a];
    } else {
      r = masterLut[r];
      g = masterLut[g];
      b = masterLut[b];
      a = masterLut[a];
    }

    output[i] = r;
    output[i + 1] = g;
    output[i + 2] = b;
    output[i + 3] = a;
  }

  return new ImageData(output, width, height);
}

export function getHistogramData(imageData: ImageData, channel: LevelsChannel, maxValue = 255): number[] {
  const histogram = new Array(maxValue + 1).fill(0);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3] ?? 255;
    const sample = getChannelValue(channel, r, g, b, a);
    const value = Math.max(0, Math.min(maxValue, sample));
    histogram[value] += 1;
  }

  return histogram;
}

export function getLogHistogramData(histogram: number[]): number[] {
  return histogram.map((value) => (value <= 0 ? 0 : Math.log10(value + 1)));
}
