/**
 * Big, unmissable "New Case ₹400 / Old Case ₹200" selector.
 *
 * Used on Register Patient (New Case tab) and both returning-patient flows
 * (Register Patient → Old Case, and Patients search). The design goal is
 * that reception can't miss what rate this visit will be billed at — so we
 * blow the selector up into a full-width card with big price chips, colored
 * borders, and an active-state that changes both fill and text weight.
 */
import {
  Box, Card, CardActionArea, Stack, Typography, Chip, Divider,
} from '@mui/material';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

const OPTIONS = [
  {
    value: 'NEW',
    title: 'New Case',
    price: 400,
    subtitle: 'First-time patient (or long-gap fresh consult)',
    icon: <FiberNewIcon />,
    color: '#0b7a4a',       // primary green
    tintBg: '#e8f4ee',
    tintBorder: '#0b7a4a',
  },
  {
    value: 'OLD',
    title: 'Old Case',
    price: 200,
    subtitle: 'Returning patient (recent follow-up)',
    icon: <ReplayIcon />,
    color: '#1e6ba1',       // clinical blue
    tintBg: '#e8f1f8',
    tintBorder: '#1e6ba1',
  },
];

export default function BillRateSelector({
  value,
  onChange,
  label = 'Bill this visit as',
  hint,
  sx,
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: '#d5e3db',
        borderWidth: 2,
        bgcolor: '#fbfdfc',
        overflow: 'hidden',
        ...sx,
      }}
    >
      {/* Header strip — makes it visually distinct from a regular form section. */}
      <Box
        sx={{
          px: 2, py: 1,
          background: 'linear-gradient(90deg, #f1f7f4 0%, #ffffff 100%)',
          borderBottom: '1px solid #e0ebe4',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Chip
          size="small"
          label="Bill Rate"
          sx={{ bgcolor: '#0b7a4a', color: '#fff', fontWeight: 700, letterSpacing: 0.4 }}
        />
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e4634' }}>
          {label}
        </Typography>
      </Box>

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        divider={<Divider orientation="vertical" flexItem />}
        sx={{ p: 1.25, gap: 1.25 }}
      >
        {OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <CardActionArea
              key={opt.value}
              onClick={() => onChange(opt.value)}
              sx={{
                flex: 1,
                borderRadius: 2,
                p: 1.5,
                bgcolor: selected ? opt.tintBg : 'transparent',
                border: '2px solid',
                borderColor: selected ? opt.tintBorder : 'transparent',
                transition: 'all 120ms ease-out',
                '&:hover': {
                  bgcolor: selected ? opt.tintBg : '#f5f9f7',
                },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5}>
                {/* Left rail: radio + icon in the option's own color */}
                <Box sx={{ color: opt.color, display: 'flex', alignItems: 'center' }}>
                  {selected
                    ? <CheckCircleIcon />
                    : <RadioButtonUncheckedIcon sx={{ color: '#b7c9c0' }} />}
                </Box>
                <Box
                  sx={{
                    width: 40, height: 40,
                    borderRadius: '50%',
                    bgcolor: selected ? opt.color : '#eef3f0',
                    color: selected ? '#fff' : opt.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 120ms ease-out',
                  }}
                >
                  {opt.icon}
                </Box>
                {/* Text */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="baseline" spacing={1}>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: selected ? 800 : 600,
                        color: selected ? opt.color : 'text.primary',
                        lineHeight: 1.15,
                      }}
                    >
                      {opt.title}
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 800,
                        color: selected ? opt.color : '#526760',
                        lineHeight: 1,
                      }}
                    >
                      ₹{opt.price}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {opt.subtitle}
                  </Typography>
                </Box>
              </Stack>
            </CardActionArea>
          );
        })}
      </Stack>

      {hint && (
        <Box
          sx={{
            px: 2, py: 1,
            borderTop: '1px solid #e0ebe4',
            bgcolor: '#f7fbf9',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        </Box>
      )}
    </Card>
  );
}
