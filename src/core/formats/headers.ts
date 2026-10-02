import type { ChannelCount } from '../raster';

/**
 * Чтение исходной глубины цвета из заголовков файлов.
 * Браузер всегда отдаёт RGBA 8 бит, поэтому настоящая глубина берётся из файла.
 */
export interface HeaderInfo {
  /** бит на канал */
  bitsPerChannel: number;
  /** количество каналов, если его можно определить по заголовку */
  channels: ChannelCount | null;
  /** палитровое изображение (PNG color type 3) */
  indexed?: boolean;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** PNG: первый чанк — IHDR, байт 24 — bit depth, байт 25 — color type. */
export function readPngHeader(bytes: Uint8Array): HeaderInfo | null {
  if (bytes.length < 26 || !isPng(bytes)) return null;
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== 'IHDR') return null;

  const bitDepth = bytes[24];
  const colorType = bytes[25];

  switch (colorType) {
    case 0:
      return { bitsPerChannel: bitDepth, channels: 1 };
    case 2:
      return { bitsPerChannel: bitDepth, channels: 3 };
    case 3:
      return { bitsPerChannel: bitDepth, channels: null, indexed: true };
    case 4:
      return { bitsPerChannel: bitDepth, channels: 2 };
    case 6:
      return { bitsPerChannel: bitDepth, channels: 4 };
    default:
      return null;
  }
}

/** JPEG: ищем маркер SOFn, в нём точность (бит) и число компонент. */
export function readJpegHeader(bytes: Uint8Array): HeaderInfo | null {
  if (!isJpeg(bytes)) return null;
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // маркеры без длины
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      offset += marker === 0xff ? 1 : 2;
      continue;
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      const precision = bytes[offset + 4];
      const components = bytes[offset + 9];
      return { bitsPerChannel: precision, channels: components === 1 ? 1 : 3 };
    }

    offset += 2 + length;
  }

  return null;
}
