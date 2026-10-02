import { detectChannels, rasterFromImageData, rasterToImageData, type ChannelCount, type RasterImage } from '../raster';
import { decodeGb7, encodeGb7, isGb7, readGb7Header } from './gb7';
import { isJpeg, isPng, readJpegHeader, readPngHeader } from './headers';

export type ImageFormat = 'PNG' | 'JPEG' | 'GB7';
export type SaveFormat = 'png' | 'jpg' | 'gb7';

/** Сведения об исходном файле для строки состояния. */
export interface SourceInfo {
  format: ImageFormat;
  /** Глубина цвета — бит на пиксель */
  bitsPerPixel: number;
  /** Расшифровка глубины, например «3 × 8 бит, RGB» */
  depthDetails: string;
}

export interface LoadedImage {
  raster: RasterImage;
  info: SourceInfo;
}

const MODEL_NAMES: Record<ChannelCount, string> = {
  1: 'Grayscale',
  2: 'Grayscale + Alpha',
  3: 'RGB',
  4: 'RGBA'
};

function describe(channels: ChannelCount, bitsPerChannel: number): Pick<SourceInfo, 'bitsPerPixel' | 'depthDetails'> {
  return {
    bitsPerPixel: channels * bitsPerChannel,
    depthDetails: channels === 1 ? `${MODEL_NAMES[channels]}` : `${MODEL_NAMES[channels]}, ${channels} × ${bitsPerChannel}`
  };
}

async function decodeWithBrowser(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D не поддерживается.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Загрузка файла: формат определяется по сигнатуре, а не по расширению. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (isGb7(bytes)) {
    const header = readGb7Header(bytes);
    return {
      raster: decodeGb7(buffer),
      info: {
        format: 'GB7',
        bitsPerPixel: header.hasMask ? 8 : 7,
        depthDetails: header.hasMask ? '7 бит серый + 1 бит маска' : 'Grayscale, 7 бит'
      }
    };
  }

  if (isPng(bytes) || isJpeg(bytes)) {
    const png = isPng(bytes);
    const header = png ? readPngHeader(bytes) : readJpegHeader(bytes);
    const imageData = await decodeWithBrowser(file);
    const channels = header?.channels ?? detectChannels(imageData);
    const raster = rasterFromImageData(imageData, channels);

    let depth: Pick<SourceInfo, 'bitsPerPixel' | 'depthDetails'>;
    if (header?.indexed) {
      depth = { bitsPerPixel: header.bitsPerChannel, depthDetails: `палитра, ${2 ** header.bitsPerChannel} цв.` };
    } else {
      depth = describe(channels, header?.bitsPerChannel ?? 8);
    }

    return { raster, info: { format: png ? 'PNG' : 'JPEG', ...depth } };
  }

  throw new Error('Неизвестный формат файла. Поддерживаются PNG, JPG и GB7.');
}

/** Кодирование изображения в выбранный формат. */
export async function encodeImage(raster: RasterImage, format: SaveFormat): Promise<Blob> {
  if (format === 'gb7') {
    return new Blob([encodeGb7(raster)], { type: 'application/octet-stream' });
  }

  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D не поддерживается.');

  if (format === 'jpg') {
    // JPEG не хранит прозрачность — подкладываем белый фон
    const tmp = document.createElement('canvas');
    tmp.width = raster.width;
    tmp.height = raster.height;
    tmp.getContext('2d')!.putImageData(rasterToImageData(raster), 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0);
  } else {
    ctx.putImageData(rasterToImageData(raster), 0, 0);
  }

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не удалось закодировать изображение.'))), mime, 0.92);
  });
}
