/**
 * IPD — Recent Indoor Sheets (Admin dashboard).
 *
 * Doctor's-eye view of every indoor-sheet edit in the last N hours,
 * grouped by patient. Design goals:
 *
 *   - Identity first. Big patient name + demographics at the top of each
 *     card so the doctor never has to squint at abbreviations.
 *   - One panel per day, not one giant 15-column table. Each slot (10 AM /
 *     4 PM / 10 PM / 6 AM) is a vertical mini-card with the three vitals
 *     stacked — much faster to scan.
 *   - Latest day auto-expanded; older days collapsed under an accordion
 *     so nothing important scrolls past.
 *   - Clinically abnormal vitals (low SpO₂, tachy/brady, hyper/hypotension,
 *     fever pulse) get a red pill so the doctor's eye is drawn to them.
 *
 * The window is a display filter only — the underlying data lives forever
 * in indoor_sheet_days.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Stack, Button, Chip, CircularProgress,
  Alert, ToggleButtonGroup, ToggleButton, IconButton, Avatar,
  Accordion, AccordionSummary, AccordionDetails, Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import PersonIcon from '@mui/icons-material/Person';
import dayjs from 'dayjs';

import { ipdApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const LAST_SEEN_KEY = 'dcms.indoorSheet.lastSeenAt';
const POLL_MS = 60 * 1000;

const HOUR_PRESETS = [1, 3, 6, 12, 24];

const fmtRelative = (iso) => {
  if (!iso) return '';
  const diffMin = dayjs().diff(dayjs(iso), 'minute');
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m ? `${h}h ${m}m ago` : `${h}h ago`;
};

const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() || '').join('') || '?';

/* ------------------------- Clinical thresholds -------------------------
 * Deliberately conservative so we highlight only clearly abnormal values.
 * The doctor keeps final judgement; we just draw the eye.
 * ---------------------------------------------------------------------- */

const gradePulse = (v) => {
  const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
  if (!n) return 'muted';
  if (n < 50 || n > 120) return 'danger';
  if (n < 60 || n > 100) return 'warn';
  return 'ok';
};
const gradeSpo2 = (v) => {
  const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
  if (!n) return 'muted';
  if (n < 92) return 'danger';
  if (n < 95) return 'warn';
  return 'ok';
};
const gradeBp = (v) => {
  const m = String(v || '').match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (!m) return 'muted';
  const sys = +m[1], dia = +m[2];
  if (sys < 90 || dia < 60 || sys >= 180 || dia >= 110) return 'danger';
  if (sys >= 140 || dia >= 90) return 'warn';
  return 'ok';
};

const GRADE_STYLE = {
  ok:     { color: 'text.primary',   bg: 'transparent',      dot: '#0b7a4a' },
  warn:   { color: '#8a5a00',        bg: '#fff8e1',          dot: '#f0a500' },
  danger: { color: '#7a1220',        bg: '#fdeaee',          dot: '#c62828' },
  muted:  { color: 'text.disabled',  bg: 'transparent',      dot: '#c9d0d8' },
};

/* ---------------------------------------------------------------------- */

export default function IndoorSheetRecent() {
  const [hours, setHours] = useState(6);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { notify } = useSnackbar();

  const load = async (opts = {}) => {
    const isBackground = !!opts.background;
    if (isBackground) setRefreshing(true); else setLoading(true);
    try {
      const r = await ipdApi.indoorSheet.recent({ hours });
      setData(r);
      // Mark as seen so the header notification stops nagging.
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    } catch (e) {
      if (!isBackground) notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      if (isBackground) setRefreshing(false); else setLoading(false);
    }
  };
  useEffect(() => { load(); }, [hours]); // eslint-disable-line
  useEffect(() => {
    const t = setInterval(() => load({ background: true }), POLL_MS);
    return () => clearInterval(t);
  }, [hours]); // eslint-disable-line

  const admissions = data?.admissions || [];

  return (
    <Box>
      {/* Toolbar */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" useFlexGap spacing={2}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Recent Indoor Sheets</Typography>
            <Typography variant="body2" color="text.secondary">
              Everything reception has recorded in the last <b>{hours} hour{hours === 1 ? '' : 's'}</b>{' '}
              across all admitted patients. Auto-refreshes every minute.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
            <ToggleButtonGroup exclusive size="small" value={hours}
              onChange={(_, v) => v && setHours(v)}
              sx={{ '& .Mui-selected': { bgcolor: '#e6f1fb !important', color: '#0c447c' } }}>
              {HOUR_PRESETS.map((h) => (
                <ToggleButton key={h} value={h} sx={{ px: 1.75, textTransform: 'none', fontWeight: 600 }}>{h}h</ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Button startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
                    variant="outlined" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Body */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : admissions.length === 0 ? (
        <Alert severity="info" icon={<MonitorHeartIcon />} sx={{ py: 2 }}>
          <b>All quiet.</b>{' '}
          No indoor-sheet activity in the last {hours} hour{hours === 1 ? '' : 's'}.
          As soon as reception saves vitals for any patient, they'll appear here.
        </Alert>
      ) : (
        <Stack spacing={2.5}>
          {admissions.map((entry) => (
            <PatientCard key={entry.admission.id} entry={entry} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

/* ---------------------- Patient card ----------------------- */

function PatientCard({ entry }) {
  const { admission, days, lastUpdatedAt } = entry;
  const ageSex = `${admission.age || ''}${admission.gender ? ' / ' + admission.gender : ''}`;
  // Latest day first (backend returns ascending; reverse for the doctor's eye).
  const orderedDays = useMemo(() => days.slice().reverse(), [days]);

  return (
    <Card variant="outlined" sx={{
      borderColor: '#c8d5e2',
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(20,30,50,0.04)',
    }}>
      {/* -------- Header: identity ------------------------------------ */}
      <Box sx={{
        px: { xs: 2, sm: 3 }, py: 2,
        borderBottom: '1px solid #dfe6ee',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'auto 1fr auto' },
        gap: 2,
        alignItems: 'center',
        background: 'linear-gradient(180deg, #f4f8fd 0%, #fafcfe 100%)',
      }}>
        <Avatar sx={{
          width: 56, height: 56, fontWeight: 800, fontSize: 20,
          background: 'linear-gradient(135deg, #0d527e 0%, #1a9162 100%)',
        }}>
          {initials(admission.patientName)}
        </Avatar>

        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {admission.patientName}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
            {ageSex.trim() && (
              <Chip size="small" icon={<PersonIcon fontSize="inherit" />} label={ageSex} variant="outlined" sx={{ height: 22 }} />
            )}
            <Typography variant="body2" color="text.secondary">
              #{admission.patientCode}
            </Typography>
            <Typography variant="body2" color="text.disabled">·</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Adm {admission.fyKey}/{admission.admissionNumber}
            </Typography>
            {admission.wardName && (
              <>
                <Typography variant="body2" color="text.disabled">·</Typography>
                <Typography variant="body2" color="text.secondary">
                  {admission.wardName} — <b>{admission.bedNumber}</b>
                </Typography>
              </>
            )}
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            {admission.mobile  && <MetaInline label="Mobile" value={admission.mobile} />}
            {admission.village && <MetaInline label="Village" value={admission.village} />}
            {admission.admittedAt && (
              <MetaInline label="Admitted" value={dayjs(admission.admittedAt).format('DD/MM/YY')} />
            )}
            {admission.admittingDoctorName && (
              <MetaInline label="By"       value={admission.admittingDoctorName} />
            )}
          </Stack>
          {admission.admissionDiagnosis && (
            <Box sx={{ mt: 1.25, pt: 1.25, borderTop: '1px dashed #dbe3ec' }}>
              <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.5, fontWeight: 700 }}>
                DIAGNOSIS
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.25 }}>
                {admission.admissionDiagnosis}
              </Typography>
            </Box>
          )}
        </Box>

        <Stack alignItems="flex-end" spacing={0.75}>
          <Chip size="small" color="warning" variant="filled"
            label={`Updated ${fmtRelative(lastUpdatedAt)}`}
            sx={{ fontWeight: 700 }} />
          <Button
            component={RouterLink}
            to={`/ipd/admissions/${admission.id}/indoor-sheet`}
            endIcon={<OpenInNewIcon />}
            size="small" variant="outlined"
          >
            Open full sheet
          </Button>
        </Stack>
      </Box>

      {/* -------- Body: one panel per day ----------------------------- */}
      <CardContent sx={{ p: { xs: 1.5, sm: 2.5 }, bgcolor: '#fdfefe' }}>
        {orderedDays.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            No day rows in this window.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {orderedDays.map((d, i) => (
              <DayPanel
                key={d.readingDate}
                day={d}
                admittedAt={admission.admittedAt}
                isLatest={i === 0}
                defaultExpanded={i === 0}
              />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function MetaInline({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', letterSpacing: 0.5, fontWeight: 700 }}>
        {label.toUpperCase()}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}

/* ---------------------- Day panel ----------------------- */

function DayPanel({ day, admittedAt, isLatest, defaultExpanded }) {
  const dayNo = admittedAt
    ? Math.max(1, dayjs(day.readingDate).startOf('day').diff(dayjs(admittedAt).startOf('day'), 'day') + 1)
    : null;

  const meds = (day.medicineLines || []).filter(
    (l) => l.med || l.dose || l.route || l.freq
  );

  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters elevation={0}
      sx={{
        border: '1px solid #dbe3ec',
        borderRadius: 1.5,
        overflow: 'hidden',
        '&:before': { display: 'none' },
        bgcolor: '#fff',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          bgcolor: isLatest ? '#eef7f1' : '#f5f7fb',
          borderBottom: '1px solid #e4e9ef',
          '& .MuiAccordionSummary-content': { my: 1 },
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" color={isLatest ? 'success' : 'default'} variant={isLatest ? 'filled' : 'outlined'}
            label={dayNo ? `Day ${dayNo}` : 'Day'}
            sx={{ fontWeight: 700, minWidth: 62 }} />
          <Typography sx={{ fontWeight: 700 }}>
            {dayjs(day.readingDate).format('dddd, DD/MM/YY')}
          </Typography>
          {isLatest && (
            <Chip size="small" label="Latest update" color="success" variant="outlined"
              sx={{ fontWeight: 700, height: 22 }} />
          )}
          <Box sx={{ flex: 1 }} />
          <DayInlineSummary day={day} meds={meds.length} />
        </Stack>
      </AccordionSummary>

      <AccordionDetails sx={{ p: { xs: 1.5, sm: 2 } }}>
        {/* Vitals — one column per time slot */}
        <SectionHeading icon={<MonitorHeartIcon fontSize="small" />} label="Vitals" />
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 1.25, mb: 2,
        }}>
          <SlotTile label="10 AM" pulse={day.pulse10am} bp={day.bp10am} spo2={day.spo210am} />
          <SlotTile label="4 PM"  pulse={day.pulse4pm}  bp={day.bp4pm}  spo2={day.spo24pm}  />
          <SlotTile label="10 PM" pulse={day.pulse10pm} bp={day.bp10pm} spo2={day.spo210pm} />
          <SlotTile label="6 AM"  pulse={day.pulse6am}  bp={day.bp6am}  spo2={day.spo26am}  />
        </Box>

        {/* Steam / Chest PT — clean labelled pills, always visible */}
        <Stack direction="row" spacing={1.25} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <TherapyPill label="Steam"      am={day.steam}   pm={day.steamPm} />
          <TherapyPill label="Chest P.T." am={day.chestPt} pm={day.chestPtPm} />
        </Stack>

        {/* Medicines for this day */}
        {meds.length > 0 && <Divider sx={{ mb: 1.5 }} />}
        {meds.length > 0 && (
          <>
            <SectionHeading icon={<LocalPharmacyIcon fontSize="small" />} label="Medicines" />
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
              gap: 0.75,
            }}>
              {meds.map((l, i) => (
                <MedRow key={i} n={i + 1} line={l} />
              ))}
            </Box>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function SectionHeading({ icon, label }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1, color: 'text.secondary' }}>
      {icon}
      <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1 }}>{label}</Typography>
    </Stack>
  );
}

/* Compact tag strip shown on the collapsed accordion so nothing important
 * hides — the doctor can see at a glance if vitals were recorded and how
 * many meds are on the list. */
function DayInlineSummary({ day, meds }) {
  const slotsWith = ['10am','4pm','10pm','6am'].filter((s) => day[`pulse${s}`] || day[`bp${s}`] || day[`spo2${s}`]).length;
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Chip size="small" variant="outlined"
        label={`${slotsWith}/4 slots`} sx={{ height: 22, fontWeight: 600 }} />
      {meds > 0 && (
        <Chip size="small" variant="outlined" color="primary"
          label={`${meds} med${meds === 1 ? '' : 's'}`} sx={{ height: 22, fontWeight: 600 }} />
      )}
    </Stack>
  );
}

/* ---------------------- Small display atoms ----------------------- */

function SlotTile({ label, pulse, bp, spo2 }) {
  const anyValue = pulse || bp || spo2;
  return (
    <Box sx={{
      border: '1px solid #e4e9ef',
      borderRadius: 1.5,
      overflow: 'hidden',
      opacity: anyValue ? 1 : 0.55,
      bgcolor: '#fff',
    }}>
      <Box sx={{ px: 1.25, py: 0.5, bgcolor: '#f2f5fa', borderBottom: '1px solid #e4e9ef' }}>
        <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 0.5, color: '#0d527e' }}>
          {label}
        </Typography>
      </Box>
      <Stack sx={{ p: 1.25 }} spacing={0.5}>
        <VitalRow label="Pulse" value={pulse} unit="bpm"  grade={gradePulse(pulse)} />
        <VitalRow label="BP"    value={bp}    unit="mmHg" grade={gradeBp(bp)}       />
        <VitalRow label="SpO₂"  value={spo2}  unit="%"    grade={gradeSpo2(spo2)}   />
      </Stack>
    </Box>
  );
}

function VitalRow({ label, value, unit, grade }) {
  const style = GRADE_STYLE[grade] || GRADE_STYLE.muted;
  const shown = value ? String(value) : '—';
  return (
    <Stack direction="row" alignItems="baseline" sx={{
      justifyContent: 'space-between',
      px: 0.75, py: 0.5,
      borderRadius: 0.75,
      bgcolor: style.bg,
    }}>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: style.dot }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
      </Stack>
      <Box sx={{ textAlign: 'right' }}>
        <Typography component="span" sx={{
          fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: style.color, fontSize: 15,
        }}>
          {shown}
        </Typography>
        {value && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
            {unit}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

function TherapyPill({ label, am, pm }) {
  const total = (Number(am) || 0) + (Number(pm) || 0);
  const active = total > 0;
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 1.5, py: 1, borderRadius: 2,
      bgcolor: active ? '#eef7f1' : '#f6f8fb',
      border: `1px solid ${active ? '#b7dcc4' : '#e4e9ef'}`,
    }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{label}</Typography>
      <Typography variant="h6" sx={{
        fontWeight: 800, lineHeight: 1,
        color: active ? '#0b7a4a' : 'text.disabled',
      }}>
        {total}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        AM {am || 0} · PM {pm || 0}
      </Typography>
    </Box>
  );
}

function MedRow({ n, line }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'baseline', gap: 1,
      px: 1.25, py: 0.75,
      border: '1px solid #eef2f7', borderRadius: 1.25,
      bgcolor: '#fbfdff',
    }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: '#0d527e', minWidth: 18 }}>
        {n}.
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="span" sx={{ fontWeight: 700 }}>
          {line.med || '—'}
        </Typography>
        {(line.dose || line.route || line.freq) && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75 }}>
            {[line.dose, line.route, line.freq].filter(Boolean).join(' · ')}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
