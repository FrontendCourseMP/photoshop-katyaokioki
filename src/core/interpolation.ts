export const INTERPOLATION_MODES = ['nearest', 'bilinear'] as const;
export type InterpolationMode = (typeof INTERPOLATION_MODES)[number];

export type ResizeStrategy = {
  name: string;
  apply: (source: ImageData, targetWidth: number, targetHeight: number) => ImageData;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const nearestNeighborStrategy: ResizeStrategy = {
  name: 'Ближайший сосед',
  apply: (source, targetWidth, targetHeight) => {
    const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    const xScale = source.width / targetWidth;
    const yScale = source.height / targetHeight;

    for (let y = 0; y < targetHeight; y += 1) {
      const srcY = clamp(Math.floor(y * yScale), 0, source.height - 1);

      for (let x = 0; x < targetWidth; x += 1) {
        const srcX = clamp(Math.floor(x * xScale), 0, source.width - 1);
        const srcIndex = (srcY * source.width + srcX) * 4;
        const targetIndex = (y * targetWidth + x) * 4;

        output[targetIndex] = source.data[srcIndex];
        output[targetIndex + 1] = source.data[srcIndex + 1];
        output[targetIndex + 2] = source.data[srcIndex + 2];
        output[targetIndex + 3] = source.data[srcIndex + 3];
      }
    }

    return new ImageData(output, targetWidth, targetHeight);
  }
};

const bilinearStrategy: ResizeStrategy = {
  name: 'Билинейная интерполяция',
  apply: (source, targetWidth, targetHeight) => {
    const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);

    for (let y = 0; y < targetHeight; y += 1) {
      const scaleY = source.height / targetHeight;
      const srcY = (y + 0.5) * scaleY - 0.5;
      const y0 = clamp(Math.floor(srcY), 0, source.height - 1);
      const y1 = clamp(Math.ceil(srcY), 0, source.height - 1);
      const yRatio = srcY - y0;

      for (let x = 0; x < targetWidth; x += 1) {
        const scaleX = source.width / targetWidth;
        const srcX = (x + 0.5) * scaleX - 0.5;
        const x0 = clamp(Math.floor(srcX), 0, source.width - 1);
        const x1 = clamp(Math.ceil(srcX), 0, source.width - 1);
        const xRatio = srcX - x0;

        const i00 = (y0 * source.width + x0) * 4;
        const i10 = (y0 * source.width + x1) * 4;
        const i01 = (y1 * source.width + x0) * 4;
        const i11 = (y1 * source.width + x1) * 4;
        const targetIndex = (y * targetWidth + x) * 4;

        for (let channel = 0; channel < 4; channel += 1) {
          const topLeft = source.data[i00 + channel];
          const topRight = source.data[i10 + channel];
          const bottomLeft = source.data[i01 + channel];
          const bottomRight = source.data[i11 + channel];

          const top = topLeft + (topRight - topLeft) * xRatio;
          const bottom = bottomLeft + (bottomRight - bottomLeft) * xRatio;
          const interpolated = top + (bottom - top) * yRatio;

          output[targetIndex + channel] = clamp(Math.round(interpolated), 0, 255);
        }
      }
    }

    return new ImageData(output, targetWidth, targetHeight);
  }
};

export const interpolationStrategies: Record<InterpolationMode, ResizeStrategy> = {
  nearest: nearestNeighborStrategy,
  bilinear: bilinearStrategy
};

export function getInterpolationStrategy(mode: InterpolationMode): ResizeStrategy {
  return interpolationStrategies[mode] ?? bilinearStrategy;
}

export function resizeImageData(
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number,
  mode: InterpolationMode = 'bilinear'
): ImageData {
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error('Размеры масштабирования должны быть положительными.');
  }

  if (targetWidth === imageData.width && targetHeight === imageData.height) {
    const copy = new Uint8ClampedArray(imageData.data);
    return new ImageData(copy, imageData.width, imageData.height);
  }

  return getInterpolationStrategy(mode).apply(imageData, targetWidth, targetHeight);
}
