import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DEFAULT_CHANNEL_SELECTION, KERNEL_PRESETS, type ChannelSelectionMap, type PaddingMode } from '../core/convolution';

type FilterDialogProps = {
  open: boolean;
  imageData: ImageData | null;
  presetId: string;
  kernel: number[][];
  channels: ChannelSelectionMap;
  padding: PaddingMode;
  previewEnabled: boolean;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  onPreviewToggle: (value: boolean) => void;
  onPresetChange: (value: string) => void;
  onKernelChange: (row: number, col: number, value: number) => void;
  onChannelToggle: (channel: keyof ChannelSelectionMap, value: boolean) => void;
  onPaddingChange: (value: PaddingMode) => void;
};

export function FilterDialog({
  open,
  imageData,
  presetId,
  kernel,
  channels,
  padding,
  previewEnabled,
  onClose,
  onApply,
  onReset,
  onPreviewToggle,
  onPresetChange,
  onKernelChange,
  onChannelToggle,
  onPaddingChange
}: FilterDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

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

  if (!imageData) {
    return null;
  }

  const changeKernelValue = (row: number, col: number, inputValue: string) => {
    const parsed = Number(inputValue);
    onKernelChange(row, col, Number.isFinite(parsed) ? parsed : 0);
  };

  return (
    <dialog ref={dialogRef} style={{ width: 'min(760px, 90vw)', border: '1px solid #cbcbcb', borderRadius: 12, padding: 0 }}>
      <Box sx={{ p: 3, background: '#fff' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6">Фильтрация ядрами</Typography>
          <Button variant="text" onClick={onClose}>Закрыть</Button>
        </Stack>

        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
            <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption">Предустановка</Typography>
              <select
                value={presetId}
                onChange={(event) => onPresetChange(event.target.value)}
                style={{ minWidth: 200, padding: '8px 10px', borderRadius: 6, border: '1px solid #d0d0d0' }}
              >
                {KERNEL_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
            </Box>

            <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption">Край</Typography>
              <select
                value={padding}
                onChange={(event) => onPaddingChange(event.target.value as PaddingMode)}
                style={{ minWidth: 150, padding: '8px 10px', borderRadius: 6, border: '1px solid #d0d0d0' }}
              >
                <option value="black">Чёрный</option>
                <option value="white">Белый</option>
                <option value="replicate">Копирование</option>
              </select>
            </Box>
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(72px, 1fr))', gap: 1 }}>
            {kernel.map((row, rowIndex) =>
              row.map((value, colIndex) => (
                <input
                  key={`${rowIndex}-${colIndex}`}
                  type="number"
                  step="0.1"
                  value={value}
                  onChange={(event) => changeKernelValue(rowIndex, colIndex, event.target.value)}
                  style={{ width: '100%', padding: '10px 8px', borderRadius: 6, border: '1px solid #d0d0d0' }}
                />
              ))
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {(['red', 'green', 'blue', 'alpha'] as const).map((channel) => (
              <FormControlLabel
                key={channel}
                control={<Checkbox checked={channels[channel]} onChange={(event) => onChannelToggle(channel, event.target.checked)} />}
                label={channel === 'red' ? 'Красный' : channel === 'green' ? 'Зелёный' : channel === 'blue' ? 'Синий' : 'Альфа'}
              />
            ))}
          </Box>

          <FormControlLabel
            control={<Checkbox checked={previewEnabled} onChange={(event) => onPreviewToggle(event.target.checked)} />}
            label="Предпросмотр"
          />
        </Stack>

        <Stack direction="row" spacing={2} justifyContent="flex-end" sx={{ mt: 3 }}>
          <Button variant="outlined" onClick={onReset}>Сброс</Button>
          <Button variant="outlined" onClick={onClose}>Отмена</Button>
          <Button variant="contained" onClick={onApply}>Применить</Button>
        </Stack>
      </Box>
    </dialog>
  );
}
