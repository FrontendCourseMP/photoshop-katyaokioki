/// <reference lib="webworker" />
import { convolve, type ConvolutionJob } from './convolution';

/**
 * Web Worker для свёртки: тяжёлые вычисления идут в отдельном потоке,
 * поэтому интерфейс остаётся отзывчивым даже на больших изображениях.
 */
type Request = { id: number; job: ConvolutionJob };

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, job } = event.data;
  let lastReport = 0;

  const result = convolve(job, (done, total) => {
    const now = performance.now();
    if (now - lastReport > 50) {
      lastReport = now;
      self.postMessage({ id, type: 'progress', value: done / total });
    }
  });

  self.postMessage({ id, type: 'done', data: result }, [result.buffer]);
};
