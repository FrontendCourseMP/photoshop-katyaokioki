export type RGB = { r: number; g: number; b: number };
export type Lab = { l: number; a: number; b: number };

function srgbToLinear(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab({ r, g, b }: RGB): Lab {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const x = 0.4124 * rl + 0.3576 * gl + 0.1805 * bl;
  const y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  const z = 0.0193 * rl + 0.1192 * gl + 0.9505 * bl;

  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;

  const fx = x / xn;
  const fy = y / yn;
  const fz = z / zn;

  const functionFor = (value: number) => {
    const delta = 6 / 29;
    if (value > delta ** 3) {
      return value ** (1 / 3);
    }
    return value / (3 * delta ** 2) + 4 / 29;
  };

  const l = 116 * functionFor(fy) - 16;
  const a = 500 * (functionFor(fx) - functionFor(fy));
  const bb = 200 * (functionFor(fy) - functionFor(fz));

  return { l: Number.isFinite(l) ? l : 0, a: Number.isFinite(a) ? a : 0, b: Number.isFinite(bb) ? bb : 0 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
