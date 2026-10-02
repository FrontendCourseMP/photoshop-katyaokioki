import { create } from 'zustand';
import type { SourceInfo } from '../core/formats';
import type { RasterImage } from '../core/raster';

/**
 * Документ редактора: исходное изображение (не изменяется) и текущее.
 * Масштаб отображения хранится отдельно и пиксели не меняет.
 */
type ImageStore = {
  original: RasterImage | null;
  image: RasterImage | null;
  fileName: string;
  info: SourceInfo | null;
  open: (image: RasterImage, fileName: string, info: SourceInfo) => void;
  setImage: (image: RasterImage) => void;
  revert: () => void;
};

export const useImageStore = create<ImageStore>((set, get) => ({
  original: null,
  image: null,
  fileName: '',
  info: null,
  open: (image, fileName, info) => set({ original: image, image, fileName, info }),
  setImage: (image) => set({ image }),
  revert: () => set({ image: get().original })
}));
