import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { createChannelPreview, getChannelDescriptor, type ChannelKey, type ChannelSelection } from '../core/channel';

function toDataUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return '';
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

type Props = {
  imageData: ImageData;
  selection: ChannelSelection;
  onToggle: (key: ChannelKey) => void;
};

export function ChannelPanel({ imageData, selection, onToggle }: Props) {
  const descriptor = getChannelDescriptor(imageData);

  return (
    <Box
      sx={{
        width: 240,
        minWidth: 220,
        borderRight: '1px solid #d9d9d9',
        background: '#f8f8f8',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        Каналы
      </Typography>

      <Stack spacing={1}>
        {descriptor.keys.map((key) => {
          const enabled = selection[key] !== false;
          const preview = createChannelPreview(imageData, key);
          const label = descriptor.labels[key];

          return (
            <Button
              key={key}
              variant={enabled ? 'contained' : 'outlined'}
              color={enabled ? 'primary' : 'inherit'}
              onClick={() => onToggle(key)}
              sx={{
                justifyContent: 'flex-start',
                textTransform: 'none',
                px: 1,
                py: 0.75,
                minHeight: 52,
                gap: 1.25
              }}
            >
              <img
                src={toDataUrl(preview)}
                alt={label}
                style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)' }}
              />
              <Box sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {label}
                </Typography>
                <Typography variant="caption" sx={{ color: enabled ? '#eaeaea' : '#666' }}>
                  {enabled ? 'включён' : 'выключен'}
                </Typography>
              </Box>
            </Button>
          );
        })}
      </Stack>
    </Box>
  );
}
