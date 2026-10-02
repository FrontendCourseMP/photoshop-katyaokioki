import { convolve, type ConvolutionJob, type EdgeMode, type Kernel } from './convolution';
import { channelMax, cloneRaster, type RasterImage } from './raster';

export interface FilterParams {
  kernel: Kernel;
  divisor: number;
  edge: EdgeMode;
  /** включённые каналы по индексу в пикселе */
  selected: boolean[];
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

/**
 * Запуск свёртки в Web Worker с возможностью отмены.
 * Новый запуск отменяет предыдущий (воркер пересоздаётся).
 */
export class FilterRunner {
  private worker: Worker | null = null;
  private seq = 0;
  private reject: ((e: Error) => void) | null = null;

  run(image: RasterImage, params: FilterParams, onProgress?: (value: number) => void): Promise<RasterImage> {
    this.cancel();
    const id = ++this.seq;
    const job: ConvolutionJob = {
      width: image.width,
      height: image.height,
      channels: image.channels,
      data: image.data,
      maxValues: Array.from({ length: image.channels }, (_, i) => channelMax(image, i)),
      selected: params.selected,
      kernel: params.kernel,
      divisor: params.divisor,
      edge: params.edge
    };

    if (typeof Worker === 'undefined') {
      return Promise.resolve(cloneRaster(image, convolve(job)));
    }

    return new Promise<RasterImage>((resolve, reject) => {
      this.reject = reject;
      const worker = new Worker(new URL('./convolution.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;

      worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.id !== id) return;
        if (msg.type === 'progress') {
          onProgress?.(msg.value);
        } else if (msg.type === 'done') {
          this.dispose();
          resolve(cloneRaster(image, msg.data));
        }
      };
      worker.onerror = (event) => {
        this.dispose();
        reject(new Error(event.message));
      };
      worker.postMessage({ id, job });
    });
  }

  cancel() {
    if (this.worker) {
      this.worker.terminate();
      this.reject?.(new CancelledError());
    }
    this.dispose();
  }

  private dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.reject = null;
  }
}
