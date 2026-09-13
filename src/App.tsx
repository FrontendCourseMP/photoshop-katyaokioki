import { useEffect, useRef, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { decodeGb7, encodeGb7 } from './core/gb7';
import { imageBitmapToImageData, getDepthFromImageData } from './core/image';
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
  const original = useImageStore((state) => state.original);
  const current = useImageStore((state) => state.current);
  const setOriginal = useImageStore((state) => state.setOriginal);
  const setCurrent = useImageStore((state) => state.setCurrent);
  const resetCurrent = useImageStore((state) => state.resetCurrent);
  const [statusText, setStatusText] = useState('Нет изображения');

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
      const maxWidth = Math.min(canvasWrap.clientWidth - 20, window.innerWidth * 0.9);
      const maxHeight = Math.min(window.innerHeight * 0.7, imageData.height * 1.2);
      canvas.style.width = `${Math.min(imageData.width, maxWidth)}px`;
      canvas.style.height = `${Math.min(imageData.height, maxHeight)}px`;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const resizeCanvas = () => {
      if (!current) {
        return;
      }

      drawCurrentImage(current.imageData);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [current]);

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
      drawCurrentImage(imageData);
      setStatusText(`${file.name} • ${imageData.width}×${imageData.height} • глубина ${depth}`);
    } catch (error) {
      console.error(error);
      setStatusText('Не удалось открыть файл. Проверьте формат изображения.');
    } finally {
      event.target.value = '';
    }
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

      <Container maxWidth="xl" sx={{ flex: 1, py: 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Box
          className="canvas-shell"
          sx={{
            width: '100%',
            height: '100%',
            minHeight: 420,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
            borderRadius: 2,
            border: '1px solid #d0d0d0',
            overflow: 'auto',
            p: 2
          }}
        >
          <canvas ref={canvasRef} className="main-canvas" />
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
