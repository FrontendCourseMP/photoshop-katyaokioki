export type PaddingMode = 'black' | 'white' | 'replicate';
export type ChannelSelectionMap = {
  red: boolean;
  green: boolean;
  blue: boolean;
  alpha: boolean;
};

export type KernelPreset = {
  id: string;
  name: string;
  kernel: number[][];
};

export const KERNEL_PRESETS: KernelPreset[] = [
  {
    id: 'identity',
    name: 'Тождественное отображение',
    kernel: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0]
    ]
  },
  {
    id: 'sharpen',
    name: 'Повышение резкости',
    kernel: [
      [0, -1, 0],
      [-1, 5, -1],
      [0, -1, 0]
    ]
  },
  {
    id: 'gaussian',
    name: 'Гаусс 3×3',
    kernel: [
      [1, 2, 1],
      [2, 4, 2],
      [1, 2, 1]
    ]
  },
  {
    id: 'box',
    name: 'Прямоугольное размытие',
    kernel: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1]
    ]
  },
  {
    id: 'prewitt-x',
    name: 'Prewitt X',
    kernel: [
      [-1, 0, 1],
      [-1, 0, 1],
      [-1, 0, 1]
    ]
  },
  {
    id: 'prewitt-y',
    name: 'Prewitt Y',
    kernel: [
      [-1, -1, -1],
      [0, 0, 0],
      [1, 1, 1]
    ]
  }
];

export const DEFAULT_CHANNEL_SELECTION: ChannelSelectionMap = {
  red: true,
  green: true,
  blue: true,
  alpha: true
};

export function normalizeKernel(kernel: number[][]): number[][] {
  const normalized = Array.from({ length: 3 }, () => Array(3).fill(0));

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const value = Number(kernel[row]?.[col] ?? 0);
      normalized[row][col] = Number.isFinite(value) ? value : 0;
    }
  }

  return normalized;
}

export function getPresetKernel(id: string): number[][] {
  const preset = KERNEL_PRESETS.find((item) => item.id === id);
  return preset ? normalizeKernel(preset.kernel) : normalizeKernel(KERNEL_PRESETS[0].kernel);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPaddingValue(paddingMode: PaddingMode, x: number, y: number, imageWidth: number, imageHeight: number, source: Uint8ClampedArray, channel: number): number {
  if (x >= 0 && x < imageWidth && y >= 0 && y < imageHeight) {
    return source[(y * imageWidth + x) * 4 + channel];
  }

  if (paddingMode === 'black') {
    return 0;
  }

  if (paddingMode === 'white') {
    return 255;
  }

  const clampedX = clamp(x, 0, imageWidth - 1);
  const clampedY = clamp(y, 0, imageHeight - 1);
  return source[(clampedY * imageWidth + clampedX) * 4 + channel];
}

export function applyKernelToImageData(
  imageData: ImageData,
  kernel: number[][],
  selectedChannels: ChannelSelectionMap,
  paddingMode: PaddingMode = 'black'
): ImageData {
  const normalizedKernel = normalizeKernel(kernel);
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);

  const kernelWeight = normalizedKernel.flat().reduce((sum, value) => sum + Math.abs(value), 0) || 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        if (!selectedChannels.red && channel === 0) continue;
        if (!selectedChannels.green && channel === 1) continue;
        if (!selectedChannels.blue && channel === 2) continue;
        if (!selectedChannels.alpha && channel === 3) continue;

        let acc = 0;

        for (let ky = 0; ky < 3; ky += 1) {
          for (let kx = 0; kx < 3; kx += 1) {
            const sampleX = x + kx - 1;
            const sampleY = y + ky - 1;
            const sampleValue = getPaddingValue(paddingMode, sampleX, sampleY, width, height, data, channel);
            acc += sampleValue * normalizedKernel[ky][kx];
          }
        }

        const normalized = kernelWeight === 0 ? acc : acc / kernelWeight;
        output[index + channel] = clamp(Math.round(normalized), 0, 255);
      }
    }
  }

  return new ImageData(output, width, height);
}

export async function applyKernelAsync(
  imageData: ImageData,
  kernel: number[][],
  selectedChannels: ChannelSelectionMap,
  paddingMode: PaddingMode = 'black',
  chunkSize = 2048
): Promise<ImageData> {
  const output = new Uint8ClampedArray(imageData.data.length);
  const { data, width, height } = imageData;
  const normalizedKernel = normalizeKernel(kernel);
  const kernelWeight = normalizedKernel.flat().reduce((sum, value) => sum + Math.abs(value), 0) || 1;

  let processed = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        if (!selectedChannels.red && channel === 0) continue;
        if (!selectedChannels.green && channel === 1) continue;
        if (!selectedChannels.blue && channel === 2) continue;
        if (!selectedChannels.alpha && channel === 3) continue;

        let acc = 0;

        for (let ky = 0; ky < 3; ky += 1) {
          for (let kx = 0; kx < 3; kx += 1) {
            const sampleX = x + kx - 1;
            const sampleY = y + ky - 1;
            const sampleValue = getPaddingValue(paddingMode, sampleX, sampleY, width, height, data, channel);
            acc += sampleValue * normalizedKernel[ky][kx];
          }
        }

        const normalized = kernelWeight === 0 ? acc : acc / kernelWeight;
        output[index + channel] = clamp(Math.round(normalized), 0, 255);
      }

      processed += 1;
      if (processed % chunkSize === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  return new ImageData(output, width, height);
}
