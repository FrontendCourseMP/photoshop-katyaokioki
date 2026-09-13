import { create } from 'zustand';

export type StoredImage = {
  imageData: ImageData;
  sourceName: string;
  depth: number;
};

type ImageStore = {
  original: StoredImage | null;
  current: StoredImage | null;
  setOriginal: (image: StoredImage) => void;
  setCurrent: (image: StoredImage) => void;
  resetCurrent: () => void;
};

export const useImageStore = create<ImageStore>((set, get) => ({
  original: null,
  current: null,
  setOriginal: (image) => set({ original: image, current: image }),
  setCurrent: (image) => set({ current: image }),
  resetCurrent: () => set({ current: get().original })
}));
