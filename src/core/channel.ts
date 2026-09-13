export type ChannelKey = 'gray' | 'alpha' | 'red' | 'green' | 'blue';
export type ChannelSelection = Partial<Record<ChannelKey, boolean>>;

export function getChannelDescriptor(imageData: ImageData): { keys: ChannelKey[]; labels: Record<ChannelKey, string> } {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  let isGrayscale = true;

  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    if (r !== g || g !== b) {
      isGrayscale = false;
      break;
    }
  }

  if (isGrayscale) {
    const keys: ChannelKey[] = ['gray'];
    if (data.some((value, index) => index % 4 === 3 && value !== 255)) {
      keys.push('alpha');
    }

    return {
      keys,
      labels: {
        gray: 'Светлость',
        alpha: 'Альфа'
      }
    };
  }

  const keys: ChannelKey[] = ['red', 'green', 'blue'];
  if (data.some((value, index) => index % 4 === 3 && value !== 255)) {
    keys.push('alpha');
  }

  return {
    keys,
    labels: {
      red: 'Красный',
      green: 'Зелёный',
      blue: 'Синий',
      alpha: 'Альфа'
    }
  };
}

export function getDefaultChannelSelection(imageData: ImageData): ChannelSelection {
  const { keys } = getChannelDescriptor(imageData);
  const selection: ChannelSelection = {};

  for (const key of keys) {
    selection[key] = true;
  }

  if (keys.includes('red') && keys.includes('green') && keys.includes('blue')) {
    selection.alpha = imageData.data.some((value, index) => index % 4 === 3 && value !== 255);
  }

  if (keys.includes('gray') && keys.includes('alpha')) {
    selection.alpha = true;
  }

  return selection;
}

export function applyChannelSelection(imageData: ImageData, selection: ChannelSelection): ImageData {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const channelDescriptor = getChannelDescriptor(imageData);
  const keys = channelDescriptor.keys;
  const isGrayscale = keys.includes('gray') && !keys.includes('red');

  const hasAnyActiveChannel = keys.some((key) => selection[key] !== false);
  const safeSelection = hasAnyActiveChannel ? selection : getDefaultChannelSelection(imageData);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3] ?? 255;
    const gray = Math.round((r + g + b) / 3);

    let outR = 0;
    let outG = 0;
    let outB = 0;
    let outA = a;

    if (isGrayscale) {
      if (safeSelection.gray !== false) {
        outR = gray;
        outG = gray;
        outB = gray;
      }
      if (safeSelection.alpha === true) {
        outA = a;
      } else if (safeSelection.alpha === false) {
        outA = 255;
      }
    } else {
      if (safeSelection.red) {
        outR = r;
      }
      if (safeSelection.green) {
        outG = g;
      }
      if (safeSelection.blue) {
        outB = b;
      }
      if (safeSelection.alpha === true) {
        outA = a;
      } else if (safeSelection.alpha === false) {
        outA = 255;
      }
    }

    if (keys.includes('red') && !safeSelection.red && !safeSelection.green && !safeSelection.blue && safeSelection.alpha === true) {
      outR = a;
      outG = a;
      outB = a;
      outA = a;
    }

    output[i] = outR;
    output[i + 1] = outG;
    output[i + 2] = outB;
    output[i + 3] = outA;
  }

  return new ImageData(output, width, height);
}

export function createChannelPreview(imageData: ImageData, channel: ChannelKey): ImageData {
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3] ?? 255;

    switch (channel) {
      case 'gray': {
        const gray = Math.round((r + g + b) / 3);
        output[i] = gray;
        output[i + 1] = gray;
        output[i + 2] = gray;
        output[i + 3] = 255;
        break;
      }
      case 'red':
        output[i] = r;
        output[i + 1] = r;
        output[i + 2] = r;
        output[i + 3] = 255;
        break;
      case 'green':
        output[i] = g;
        output[i + 1] = g;
        output[i + 2] = g;
        output[i + 3] = 255;
        break;
      case 'blue':
        output[i] = b;
        output[i + 1] = b;
        output[i + 2] = b;
        output[i + 3] = 255;
        break;
      case 'alpha': {
        output[i] = a;
        output[i + 1] = a;
        output[i + 2] = a;
        output[i + 3] = 255;
        break;
      }
      default:
        break;
    }
  }

  return new ImageData(output, width, height);
}
