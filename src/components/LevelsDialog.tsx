import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { LEVEL_CHANNELS, getHistogramData, getLogHistogramData, type LevelsChannel, type LevelsSettings } from '../core/levels';

type Props = {
  open: boolean;
  imageData: ImageData | null;
  maxValue: number;
  activeChannel: LevelsChannel;
  settings: LevelsSettings;
  previewEnabled: boolean;
  histogramMode: 'linear' | 'log';
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  onTogglePreview: (value: boolean) => void;
  onChannelChange: (channel: LevelsChannel) => void;
  onSettingChange: (channel: LevelsChannel, field: 'black' | 'white' | 'gamma', value: number) => void;
  onHistogramModeChange: (mode: 'linear' | 'log') => void;
};

export function LevelsDialog({
  open,
  imageData,
  maxValue,
  activeChannel,
  settings,
  previewEnabled,
  histogramMode,
  onClose,
  onApply,
  onReset,
  onTogglePreview,
  onChannelChange,
  onSettingChange,
  onHistogramModeChange
}: Props) {
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

  const channelConfig = settings[activeChannel];
  const series = {
    master: getHistogramData(imageData, 'master', maxValue),
    red: getHistogramData(imageData, 'red', maxValue),
    green: getHistogramData(imageData, 'green', maxValue),
    blue: getHistogramData(imageData, 'blue', maxValue),
    alpha: getHistogramData(imageData, 'alpha', maxValue)
  };

  const bars = Object.entries(series).map(([key, values]) => ({
    key,
    values: histogramMode === 'log' ? getLogHistogramData(values) : values
  }));

  const maxBar = Math.max(1, ...bars.flatMap((item) => item.values));
  const colorMap: Record<string, string> = {
    master: '#333333',
    red: '#d32f2f',
    green: '#2e7d32',
    blue: '#1976d2',
    alpha: '#7b1fa2'
  };
  const channelLabel = activeChannel === 'master' ? 'Master' : activeChannel;
  const histogramLabel = histogramMode === 'linear' ? 'Линейный' : 'Логарифмический';

  return (
    <dialog ref={dialogRef} style={{ width: 'min(900px, 90vw)', border: '1px solid #cbcbcb', borderRadius: 12, padding: 0 }}>
      <Box sx={{ p: 3, background: '#fff' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6">Уровни</Typography>
          <Button variant="text" onClick={onClose}>Закрыть</Button>
        </Stack>

        <Box sx={{ mb: 2, px: 1, py: 0.75, borderRadius: 1, background: '#f5f5f5', border: '1px solid #e1e1e1' }}>
          <Typography variant="body2">Активный канал: <b>{channelLabel}</b> • Масштаб: <b>{histogramLabel}</b></Typography>
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Box sx={{ flex: 1.3 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption">Канал</Typography>
                <select
                  value={activeChannel}
                  onChange={(event) => onChannelChange(event.target.value as LevelsChannel)}
                  style={{ minWidth: 120, padding: '6px 10px', borderRadius: 6, border: '1px solid #d0d0d0', background: '#fff' }}
                >
                  {LEVEL_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel === 'master' ? 'Master' : channel}
                    </option>
                  ))}
                </select>
              </Box>

              <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption">Масштаб</Typography>
                <select
                  value={histogramMode}
                  onChange={(event) => onHistogramModeChange(event.target.value as 'linear' | 'log')}
                  style={{ minWidth: 140, padding: '6px 10px', borderRadius: 6, border: '1px solid #d0d0d0', background: '#fff' }}
                >
                  <option value="linear">Линейный</option>
                  <option value="log">Логарифмический</option>
                </select>
              </Box>
            </Stack>

            <Box sx={{ height: 220, border: '1px solid #ddd', borderRadius: 1, p: 1, background: '#fbfbfb', overflow: 'hidden' }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(256, (maxValue + 1) * 2.2)} 100`} preserveAspectRatio="none" style={{ display: 'block' }}>
                {bars.map((bar) => {
                  const isActive = bar.key === activeChannel || bar.key === 'master';
                  const opacity = isActive ? 1 : 0.25;
                  const color = colorMap[bar.key];

                  return bar.values.map((value, index) => {
                    const x = index * 2.2;
                    const barHeight = 100 * (value / maxBar);
                    const y = 100 - barHeight;
                    return (
                      <rect
                        key={`${bar.key}-${index}`}
                        x={x}
                        y={y}
                        width={1.8}
                        height={Math.max(barHeight, value > 0 ? 2 : 0)}
                        fill={color}
                        opacity={opacity}
                      />
                    );
                  });
                })}
              </svg>
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: 260 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="caption">Чёрная точка</Typography>
                <Slider value={channelConfig.black} onChange={(_, value) => onSettingChange(activeChannel, 'black', Number(value))} min={0} max={maxValue} step={1} valueLabelDisplay="auto" />
              </Box>

              <Box>
                <Typography variant="caption">Белая точка</Typography>
                <Slider value={channelConfig.white} onChange={(_, value) => onSettingChange(activeChannel, 'white', Number(value))} min={0} max={maxValue} step={1} valueLabelDisplay="auto" />
              </Box>

              <Box>
                <Typography variant="caption">Гамма</Typography>
                <Slider value={channelConfig.gamma} onChange={(_, value) => onSettingChange(activeChannel, 'gamma', Number(value))} min={0.1} max={9.9} step={0.1} valueLabelDisplay="auto" />
              </Box>

              <FormControlLabel
                control={<Checkbox checked={previewEnabled} onChange={(event) => onTogglePreview(event.target.checked)} />}
                label="Предпросмотр"
              />
            </Stack>
          </Box>
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
