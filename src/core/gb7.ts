export const GB7_SIGNATURE = [0x47, 0x42, 0x37, 0x1d];

export function decodeGb7(buffer: ArrayBuffer): ImageData {
  const bytes = new Uint8Array(buffer);
  const headerLength = 12;

  if (bytes.length < headerLength) {
    throw new Error('Файл GB7 слишком короткий.');
  }

  if (!GB7_SIGNATURE.every((value, index) => bytes[index] === value)) {
    throw new Error('Неверная сигнатура GB7.');
  }

  const version = bytes[4];
  const flags = bytes[5];
  const width = (bytes[6] << 8) | bytes[7];
  const height = (bytes[8] << 8) | bytes[9];
  const pixelCount = width * height;
  const expectedLength = headerLength + pixelCount;

  if (bytes.length < expectedLength) {
    throw new Error('Некорректная длина данных GB7.');
  }

  if (version !== 1) {
    throw new Error(`Поддерживается только GB7 v1, получена версия ${version}.`);
  }

  const hasMask = (flags & 0x01) === 1;
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  const dataOffset = headerLength;

  for (let i = 0; i < pixelCount; i += 1) {
    const value = bytes[dataOffset + i];
    const gray = value & 0x7f;
    const alpha = hasMask ? (value & 0x80 ? 255 : 0) : 255;
    const offset = i * 4;
    rgba[offset] = gray;
    rgba[offset + 1] = gray;
    rgba[offset + 2] = gray;
    rgba[offset + 3] = alpha;
  }

  return new ImageData(rgba, width, height);
}

export function encodeGb7(imageData: ImageData, withMask = true): Uint8Array {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const result = new Uint8Array(12 + pixelCount);

  result[0] = 0x47;
  result[1] = 0x42;
  result[2] = 0x37;
  result[3] = 0x1d;
  result[4] = 1;
  result[5] = withMask ? 1 : 0;
  result[6] = (width >> 8) & 0xff;
  result[7] = width & 0xff;
  result[8] = (height >> 8) & 0xff;
  result[9] = height & 0xff;
  result[10] = 0;
  result[11] = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3] ?? 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    let gray = Math.round((luminance / 255) * 127);
    gray = Math.max(0, Math.min(127, gray));

    let value = gray;
    if (withMask && a > 127) {
      value |= 0x80;
    }

    result[12 + i] = value;
  }

  return result;
}
