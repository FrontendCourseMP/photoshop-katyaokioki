import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { INTERPOLATION_MODES, type InterpolationMode } from '../core/interpolation';

type ResizeDialogProps = {
  open: boolean;
  imageWidth: number;
  imageHeight: number;
  onClose: () => void;
  onApply: (nextWidth: number, nextHeight: number, interpolation: InterpolationMode) => void;
};

type ResizeUnit = 'percent' | 'pixels';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function ResizeDialog({ open, imageWidth, imageHeight, onClose, onApply }: ResizeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const aspectRatio = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1;
  const [unit, setUnit] = useState<ResizeUnit>('percent');
  const [width, setWidth] = useState(imageWidth);
  const [height, setHeight] = useState(imageHeight);
  const [keepAspect, setKeepAspect] = useState(true);
  const [interpolation, setInterpolation] = useState<InterpolationMode>('bilinear');

  useEffect(() => {
    if (!dialogRef.current) {
      return;
    }

    if (open) {
      dialogRef.current.showModal();
    } else {
      dialogRef.current.close();
    }
  }, [open]);

  useEffect(() => {
    setWidth(imageWidth);
    setHeight(imageHeight);
  }, [imageWidth, imageHeight, open]);

  const percentValue = useMemo(() => {
    const base = Math.max(imageWidth, imageHeight, 1);
    return Math.round((base / base) * 100);
  }, [imageWidth, imageHeight]);

  const applySize = () => {
    const nextWidth = clamp(Math.round(width), 1, 10000);
    const nextHeight = clamp(Math.round(height), 1, 10000);
    onApply(nextWidth, nextHeight, interpolation);
  };

  const handleDimensionChange = (nextValue: number, target: 'width' | 'height') => {
    const safeValue = clamp(Number.isFinite(nextValue) ? nextValue : 0, 1, 10000);

    if (target === 'width') {
      setWidth(safeValue);
      if (keepAspect) {
        setHeight(Math.max(1, Math.round(safeValue / aspectRatio)));
      }
      return;
    }

    setHeight(safeValue);
    if (keepAspect) {
      setWidth(Math.max(1, Math.round(safeValue * aspectRatio)));
    }
  };

  const handlePercentChange = (value: number) => {
    const safePercent = clamp(value, 12, 300);
    const nextWidth = Math.max(1, Math.round(imageWidth * (safePercent / 100)));
    const nextHeight = Math.max(1, Math.round(imageHeight * (safePercent / 100)));
    setWidth(nextWidth);
    setHeight(nextHeight);
    setUnit('percent');
  };

  if (!open) {
    return null;
  }

  return (
    <dialog ref={dialogRef} style={{ width: 'min(560px, 90vw)', border: '1px solid #cbcbcb', borderRadius: 12, padding: 0 }}>
      <Box sx={{ p: 3, background: '#fff' }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Изменить размер</Typography>

        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption">Единица</Typography>
              <select
                value={unit}
                onChange={(event) => setUnit(event.target.value as ResizeUnit)}
                style={{ minWidth: 120, padding: '6px 8px', borderRadius: 6, border: '1px solid #d0d0d0' }}
              >
                <option value="percent">Проценты</option>
                <option value="pixels">Пиксели</option>
              </select>
            </Box>

            <FormControlLabel
              control={<Checkbox checked={keepAspect} onChange={(event) => setKeepAspect(event.target.checked)} />}
              label="Сохранять пропорции"
            />
          </Stack>

          {unit === 'percent' ? (
            <Box>
              <Typography variant="caption">Масштаб</Typography>
              <input
                type="range"
                min={12}
                max={300}
                step={1}
                value={Math.max(12, Math.min(300, Math.round((Math.max(width, height) / Math.max(imageWidth, imageHeight)) * 100 || 100)))}
                onChange={(event) => handlePercentChange(Number(event.target.value))}
                style={{ width: '100%' }}
              />
              <Typography variant="caption">{Math.max(12, Math.min(300, Math.round((Math.max(width, height) / Math.max(imageWidth, imageHeight)) * 100 || 100)))}%</Typography>
            </Box>
          ) : null}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Ширина"
              type="number"
              value={width}
              onChange={(event) => handleDimensionChange(Number(event.target.value), 'width')}
              inputProps={{ min: 1, max: 10000 }}
              fullWidth
            />
            <TextField
              label="Высота"
              type="number"
              value={height}
              onChange={(event) => handleDimensionChange(Number(event.target.value), 'height')}
              inputProps={{ min: 1, max: 10000 }}
              fullWidth
            />
          </Stack>

          <Box>
            <Typography variant="caption">Алгоритм интерполяции</Typography>
            <select
              value={interpolation}
              onChange={(event) => setInterpolation(event.target.value as InterpolationMode)}
              title="Билинейная интерполяция лучше сохраняет границы и плавность. Ближайший сосед — резкий и «пиксельный»."
              style={{ width: '100%', padding: '12px 10px', borderRadius: 6, border: '1px solid #d0d0d0', marginTop: 6 }}
            >
              {INTERPOLATION_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'nearest' ? 'Ближайший сосед' : 'Билинейная интерполяция'}
                </option>
              ))}
            </select>
          </Box>

          <Typography variant="caption" sx={{ color: '#666' }}>
            Размер до: {imageWidth}×{imageHeight}px • после: {Math.round(width)}×{Math.round(height)}px • {((Math.round(width) * Math.round(height)) / 1_000_000).toFixed(2)} Мп
          </Typography>
        </Stack>

        <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3 }}>
          <Button variant="outlined" onClick={onClose}>Отмена</Button>
          <Button variant="contained" onClick={applySize}>Применить</Button>
        </Stack>
      </Box>
    </dialog>
  );
}
