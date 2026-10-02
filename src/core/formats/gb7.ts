import { createRaster, colorMax, hasAlpha, luma, type RasterImage } from '../raster';

/**
 * GrayBit-7: 12 байт заголовка + W×H байт данных.
 * В байте пикселя биты 0–6 — серый (0..127), бит 7 — маска (если флаг маски = 1).
 */
export const GB7_SIGNATURE = [0x47, 0x42, 0x37, 0x1d] as const;
export const GB7_HEADER_SIZE = 12;
export const GB7_VERSION = 1;

export interface Gb7Header {
  version: number;
  hasMask: boolean;
  width: number;
  height: number;
}

export function isGb7(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && GB7_SIGNATURE.every((value, index) => bytes[index] === value);
}

export function readGb7Header(bytes: Uint8Array): Gb7Header {
  if (bytes.length < GB7_HEADER_SIZE) {
    throw new Error('Файл GB7 слишком короткий.');
  }
  if (!isGb7(bytes)) {
    throw new Error('Неверная сигнатура GB7.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(4);
  const flags = view.getUint8(5);

  if (version !== GB7_VERSION) {
    throw new Error(`Поддерживается только GB7 версии 1, в файле версия ${version}.`);
  }

  return {
    version,
    hasMask: (flags & 0x01) === 1,
    width: view.getUint16(6, false), // big-endian
    height: view.getUint16(8, false)
  };
}

/**
 * Декодирование GB7 в растр.
 * Без маски — 1 канал (серый, 7 бит), с маской — 2 канала (серый + альфа 0/255).
 */
export function decodeGb7(buffer: ArrayBuffer): RasterImage {
  const bytes = new Uint8Array(buffer);
  const header = readGb7Header(bytes);
  const { width, height, hasMask } = header;

  if (width === 0 || height === 0) {
    throw new Error('Нулевой размер изображения GB7.');
  }

  const pixelCount = width * height;
  if (bytes.length < GB7_HEADER_SIZE + pixelCount) {
    throw new Error(`Данных меньше, чем нужно: ожидалось ${pixelCount} байт пикселей.`);
  }

  const channels = hasMask ? 2 : 1;
  const raster = createRaster(width, height, channels, 7);
  const out = raster.data;

  for (let i = 0; i < pixelCount; i += 1) {
    const byte = bytes[GB7_HEADER_SIZE + i];
    if (hasMask) {
      out[i * 2] = byte & 0x7f;
      out[i * 2 + 1] = byte & 0x80 ? 255 : 0;
    } else {
      out[i] = byte & 0x7f;
    }
  }

  return raster;
}

/**
 * Кодирование растра в GB7. Цветные изображения переводятся в серый
 * по светлоте, 8-битные значения — в 7 бит. Маска пишется, если у изображения
 * есть альфа-канал: пиксель считается непрозрачным при alpha >= 128.
 */
export function encodeGb7(image: RasterImage): Uint8Array<ArrayBuffer> {
  const { width, height, channels, data } = image;
  if (width > 0xffff || height > 0xffff) {
    throw new Error('GB7 поддерживает размеры до 65535 пикселей.');
  }

  const withMask = hasAlpha(image);
  const pixelCount = width * height;
  const result = new Uint8Array(GB7_HEADER_SIZE + pixelCount);
  const view = new DataView(result.buffer);

  GB7_SIGNATURE.forEach((value, index) => view.setUint8(index, value));
  view.setUint8(4, GB7_VERSION);
  view.setUint8(5, withMask ? 1 : 0);
  view.setUint16(6, width, false);
  view.setUint16(8, height, false);
  view.setUint16(10, 0, false);

  const toSeven = 127 / colorMax(image);

  for (let i = 0, s = 0; i < pixelCount; i += 1, s += channels) {
    const gray = channels <= 2 ? data[s] : luma(data[s], data[s + 1], data[s + 2]);
    let value = Math.min(127, Math.max(0, Math.round(gray * toSeven)));
    if (withMask) {
      const alpha = data[s + channels - 1];
      if (alpha >= 128) value |= 0x80;
    }
    result[GB7_HEADER_SIZE + i] = value;
  }

  return result;
}
