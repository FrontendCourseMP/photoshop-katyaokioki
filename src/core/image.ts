export function imageBitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D не поддерживается в этом браузере.');
  }

  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

export function getDepthFromImageData(imageData: ImageData): number {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  let hasAlpha = false;
  let isGrayscale = true;

  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];

    if (a !== 255) {
      hasAlpha = true;
    }

    if (r !== g || g !== b) {
      isGrayscale = false;
    }
  }

  if (isGrayscale && hasAlpha) {
    return 2;
  }

  if (isGrayscale) {
    return 1;
  }

  return hasAlpha ? 4 : 3;
}
