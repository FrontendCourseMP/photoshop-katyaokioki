import { useEffect, useRef, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { ChannelPanel } from './components/ChannelPanel';
import { LevelsDialog } from './components/LevelsDialog';
import { ResizeDialog } from './components/ResizeDialog';
import { applyChannelSelection, getDefaultChannelSelection, type ChannelKey, type ChannelSelection } from './core/channel';
import { rgbToLab } from './core/color';
import { decodeGb7, encodeGb7 } from './core/gb7';
import { imageBitmapToImageData, getDepthFromImageData } from './core/image';
import { applyLevelsToImageData, createDefaultLevels, normalizeLevelConfig, type LevelsChannel, type LevelsSettings } from './core/levels';
import { INTERPOLATION_MODES, resizeImageData, type InterpolationMode } from './core/interpolation';
import { useImageStore } from './store/imageStore';

async function loadImageFile(file: File): Promise<ImageData> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.gb7')) {
    const buffer = await file.arrayBuffer();
    return decodeGb7(buffer);
  }

  const bitmap = await createImageBitmap(file);
  return imageBitmapToImageData(bitmap);
}

function buildFileName(baseName: string, extension: 'png' | 'jpg' | 'gb7'): string {
  const clean = baseName.replace(/\.[^.]+$/, '');
  return `${clean}.${extension}`;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const current = useImageStore((state) => state.current);
  const setOriginal = useImageStore((state) => state.setOriginal);
  const setCurrent = useImageStore((state) => state.setCurrent);
  const [statusText, setStatusText] = useState('Нет изображения');
  const [channelSelection, setChannelSelection] = useState<ChannelSelection>({});
  const [activeTool, setActiveTool] = useState<'move' | 'eyedropper'>('move');
  const [pickerInfo, setPickerInfo] = useState<{ x: number; y: number; r: number; g: number; b: number; l: number; a: number; bChannel: number } | null>(null);
  const renderedImageRef = useRef<ImageData | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [levelsChannel, setLevelsChannel] = useState<LevelsChannel>('master');
  const [levelsSettings, setLevelsSettings] = useState<LevelsSettings>(createDefaultLevels());
  const [levelsPreviewEnabled, setLevelsPreviewEnabled] = useState(true);
  const [histogramMode, setHistogramMode] = useState<'linear' | 'log'>('linear');
  const [scalePercent, setScalePercent] = useState(100);
  const [resizeMode, setResizeMode] = useState<InterpolationMode>('bilinear');
  const [resizeDialogOpen, setResizeDialogOpen] = useState(false);

  const getMaxLevelValue = () => (current?.depth === 1 ? 127 : 255);

  const drawCurrentImage = (imageData: ImageData) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx.putImageData(imageData, 0, 0);

    const canvasWrap = canvas.parentElement;
    if (canvasWrap) {
      const maxWidth = Math.min(canvasWrap.clientWidth - 10, window.innerWidth * 0.8);
      const maxHeight = Math.min(window.innerHeight * 0.7, imageData.height * 1.2);
      canvas.style.width = `${Math.min(imageData.width, maxWidth)}px`;
      canvas.style.height = `${Math.min(imageData.height, maxHeight)}px`;
    }
  };

  useEffect(() => {
    if (!current) {
      return;
    }

    setChannelSelection(getDefaultChannelSelection(current.imageData));
    setLevelsSettings(createDefaultLevels(getMaxLevelValue()));
    setScalePercent(100);
  }, [current]);

  useEffect(() => {
    if (!current) {
      return;
    }

    const selection = Object.keys(channelSelection).length > 0 ? channelSelection : getDefaultChannelSelection(current.imageData);
    const basePreview = applyChannelSelection(current.imageData, selection);
    renderedImageRef.current = basePreview;

    const renderPreview = () => {
      if (levelsOpen && levelsPreviewEnabled) {
        const preview = applyLevelsToImageData(basePreview, levelsSettings, levelsChannel, getMaxLevelValue());
        drawCurrentImage(preview);
        return;
      }

      drawCurrentImage(basePreview);
    };

    if (renderFrameRef.current) {
      cancelAnimationFrame(renderFrameRef.current);
    }

    renderFrameRef.current = requestAnimationFrame(renderPreview);

    const resizeCanvas = () => {
      renderPreview();
    };

    window.addEventListener('resize', resizeCanvas);
    return () => {
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [current, channelSelection, levelsOpen, levelsPreviewEnabled, levelsSettings, levelsChannel]);

  const handleFileLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const imageData = await loadImageFile(file);
      const depth = getDepthFromImageData(imageData);
      const image = {
        imageData,
        sourceName: file.name,
        depth
      };

      setOriginal(image);
      setCurrent(image);
      setStatusText(`${file.name} • ${imageData.width}×${imageData.height} • глубина ${depth}`);
    } catch (error) {
      console.error(error);
      setStatusText('Не удалось открыть файл. Проверьте формат изображения.');
    } finally {
      event.target.value = '';
    }
  };

  const handleChannelToggle = (key: ChannelKey) => {
    if (!current) {
      return;
    }

    setChannelSelection((prev) => {
      const base = getDefaultChannelSelection(current.imageData);
      const next = { ...base, ...prev, [key]: !(prev[key] ?? base[key] ?? true) };

      const activeChannels = Object.keys(next).filter((entryKey) => next[entryKey as ChannelKey] !== false);
      if (activeChannels.length === 0) {
        return { ...base, [key]: true };
      }

      return next;
    });
  };

  const handleScaleChange = (percent: number) => {
    if (!current) {
      return;
    }

    const nextPercent = Math.max(12, Math.min(300, Number(percent) || 100));
    const targetWidth = Math.max(1, Math.round(current.imageData.width * (nextPercent / 100)));
    const targetHeight = Math.max(1, Math.round(current.imageData.height * (nextPercent / 100)));
    const scaledImage = resizeImageData(current.imageData, targetWidth, targetHeight, resizeMode);

    setCurrent({
      ...current,
      imageData: scaledImage
    });
    setScalePercent(nextPercent);
    setStatusText(`Масштаб: ${nextPercent}% • ${targetWidth}×${targetHeight}`);
  };

  const openResizeDialog = () => {
    if (!current) {
      return;
    }

    setResizeDialogOpen(true);
  };

  const applyResize = (nextWidth: number, nextHeight: number, interpolation: InterpolationMode) => {
    if (!current) {
      return;
    }

    const clampedWidth = Math.max(1, Math.min(10000, Math.round(nextWidth)));
    const clampedHeight = Math.max(1, Math.min(10000, Math.round(nextHeight)));
    const resized = resizeImageData(current.imageData, clampedWidth, clampedHeight, interpolation);

    setCurrent({
      ...current,
      imageData: resized
    });
    setResizeDialogOpen(false);
    setResizeMode(interpolation);
    setScalePercent(Math.round((Math.max(clampedWidth, clampedHeight) / Math.max(current.imageData.width, current.imageData.height)) * 100));
    setStatusText(`Размер изменён: ${clampedWidth}×${clampedHeight} • ${interpolation}`);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!current || activeTool !== 'eyedropper') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((event.clientX - rect.left) * scaleX);
    const y = Math.floor((event.clientY - rect.top) * scaleY);

    const displayData = renderedImageRef.current ?? current.imageData;
    const pixelIndex = (y * displayData.width + x) * 4;
    const r = displayData.data[pixelIndex] ?? 0;
    const g = displayData.data[pixelIndex + 1] ?? 0;
    const b = displayData.data[pixelIndex + 2] ?? 0;
    const lab = rgbToLab({ r, g, b });

    setPickerInfo({
      x,
      y,
      r,
      g,
      b,
      l: Number(lab.l.toFixed(2)),
      a: Number(lab.a.toFixed(2)),
      bChannel: Number(lab.b.toFixed(2))
    });

    setStatusText(`Пипетка: X=${x}, Y=${y} • RGB=(${r}, ${g}, ${b})`);
  };

  const handleDownload = async (format: 'png' | 'jpg' | 'gb7') => {
    if (!current) {
      return;
    }

    let blob: Blob;

    if (format === 'gb7') {
      blob = new Blob([encodeGb7(current.imageData, current.depth === 2 || current.depth === 1 ? false : true)], { type: 'application/octet-stream' });
    } else {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = current.imageData.width;
      exportCanvas.height = current.imageData.height;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.putImageData(current.imageData, 0, 0);
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      blob = await new Promise<Blob>((resolve) => {
        exportCanvas.toBlob((result) => resolve(result ?? new Blob()), mimeType, 0.92);
      });
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildFileName(current.sourceName, format);
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusText(`Файл сохранён: ${anchor.download}`);
  };

  const openLevelsDialog = () => {
    if (!current) {
      return;
    }

    const maxValue = getMaxLevelValue();
    setLevelsSettings(createDefaultLevels(maxValue));
    setLevelsChannel('master');
    setLevelsPreviewEnabled(true);
    setLevelsOpen(true);
  };

  const applyLevels = () => {
    if (!current) {
      return;
    }

    const transformed = applyLevelsToImageData(current.imageData, levelsSettings, levelsChannel, getMaxLevelValue());
    setCurrent({
      ...current,
      imageData: transformed
    });
    setLevelsOpen(false);
    setStatusText('Уровни применены');
  };

  const cancelLevels = () => {
    if (!current) {
      return;
    }

    setLevelsOpen(false);
    setLevelsPreviewEnabled(false);
    drawCurrentImage(renderedImageRef.current ?? current.imageData);
  };

  const resetLevels = () => {
    const maxValue = getMaxLevelValue();
    setLevelsSettings(createDefaultLevels(maxValue));
  };

  const updateLevelsSetting = (channel: LevelsChannel, field: 'black' | 'white' | 'gamma', value: number) => {
    const maxValue = getMaxLevelValue();
    setLevelsSettings((prev) => ({
      ...prev,
      [channel]: normalizeLevelConfig({ ...prev[channel], [field]: value }, maxValue)
    }));
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            Графический редактор
          </Typography>

          <Button variant="contained" component="label">
            Открыть
            <input type="file" hidden accept=".png,.jpg,.jpeg,.gb7,image/png,image/jpeg" onChange={handleFileLoad} ref={inputRef} />
          </Button>

          <Button
            variant={activeTool === 'eyedropper' ? 'contained' : 'outlined'}
            onClick={() => setActiveTool((prev) => (prev === 'eyedropper' ? 'move' : 'eyedropper'))}
            disabled={!current}
          >
            Пипетка
          </Button>

          <Button variant="outlined" onClick={openLevelsDialog} disabled={!current}>
            Уровни
          </Button>

          <Button variant="outlined" onClick={openResizeDialog} disabled={!current}>
            Изменить размер
          </Button>

          <Button variant="outlined" onClick={() => handleDownload('png')} disabled={!current}>
            PNG
          </Button>
          <Button variant="outlined" onClick={() => handleDownload('jpg')} disabled={!current}>
            JPG
          </Button>
          <Button variant="outlined" onClick={() => handleDownload('gb7')} disabled={!current}>
            GB7
          </Button>
        </Toolbar>
      </AppBar>

      <LevelsDialog
        open={levelsOpen}
        imageData={current?.imageData ?? null}
        maxValue={getMaxLevelValue()}
        activeChannel={levelsChannel}
        settings={levelsSettings}
        previewEnabled={levelsPreviewEnabled}
        histogramMode={histogramMode}
        onClose={cancelLevels}
        onApply={applyLevels}
        onReset={resetLevels}
        onTogglePreview={setLevelsPreviewEnabled}
        onChannelChange={setLevelsChannel}
        onSettingChange={updateLevelsSetting}
        onHistogramModeChange={setHistogramMode}
      />

      <ResizeDialog
        open={resizeDialogOpen}
        imageWidth={current?.imageData.width ?? 0}
        imageHeight={current?.imageData.height ?? 0}
        onClose={() => setResizeDialogOpen(false)}
        onApply={applyResize}
      />

      <Container maxWidth="xl" sx={{ flex: 1, py: 2, display: 'flex', justifyContent: 'center', alignItems: 'stretch' }}>
        <Box sx={{ display: 'flex', width: '100%', height: '100%', minHeight: 420, borderRadius: 2, border: '1px solid #d0d0d0', overflow: 'hidden', background: '#ffffff' }}>
          {current && <ChannelPanel imageData={current.imageData} selection={channelSelection} onToggle={handleChannelToggle} />}

          <Box
            className="canvas-shell"
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)',
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
              overflow: 'auto',
              p: 2,
              gap: 1
            }}
          >
            <canvas ref={canvasRef} className="main-canvas" onClick={handleCanvasClick} style={{ cursor: activeTool === 'eyedropper' ? 'crosshair' : 'default' }} />

            <Box sx={{ alignSelf: 'stretch', background: '#fff', border: '1px solid #dadada', borderRadius: 1, p: 1.5, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption">Масштаб</Typography>
                <select
                  value={scalePercent}
                  onChange={(event) => handleScaleChange(Number(event.target.value))}
                  disabled={!current}
                  style={{ minWidth: 110, padding: '6px 8px', borderRadius: 6, border: '1px solid #d0d0d0' }}
                >
                  {[12, 25, 50, 75, 100, 125, 150, 200, 300].map((value) => (
                    <option key={value} value={value}>{value}%</option>
                  ))}
                </select>
              </Box>

              <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption">Интерполяция</Typography>
                <select
                  value={resizeMode}
                  onChange={(event) => setResizeMode(event.target.value as InterpolationMode)}
                  disabled={!current}
                  style={{ minWidth: 170, padding: '6px 8px', borderRadius: 6, border: '1px solid #d0d0d0' }}
                >
                  {INTERPOLATION_MODES.map((mode) => (
                    <option key={mode} value={mode}>{mode === 'nearest' ? 'Ближайший сосед' : 'Билинейная'}</option>
                  ))}
                </select>
              </Box>
            </Box>

            {pickerInfo && (
              <Box sx={{ alignSelf: 'stretch', background: '#fff', border: '1px solid #dadada', borderRadius: 1, p: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Пипетка</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Typography variant="caption">X: {pickerInfo.x}</Typography>
                  <Typography variant="caption">Y: {pickerInfo.y}</Typography>
                  <Typography variant="caption">R: {pickerInfo.r}</Typography>
                  <Typography variant="caption">G: {pickerInfo.g}</Typography>
                  <Typography variant="caption">B: {pickerInfo.b}</Typography>
                  <Typography variant="caption">L*: {pickerInfo.l}</Typography>
                  <Typography variant="caption">a*: {pickerInfo.a}</Typography>
                  <Typography variant="caption">b*: {pickerInfo.bChannel}</Typography>
                </Stack>
              </Box>
            )}
          </Box>
        </Box>
      </Container>

      <Box component="footer" sx={{ px: 2, py: 1, borderTop: '1px solid #d8d8d8', background: '#f3f3f3', fontSize: 14 }}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <Typography variant="body2">{statusText}</Typography>
          <Typography variant="body2">
            {current ? `${current.imageData.width}×${current.imageData.height}` : '0×0'} • глубина {current?.depth ?? 0}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
