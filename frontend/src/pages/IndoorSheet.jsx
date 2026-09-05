/**
 * Indoor Sheet — one Day Block per admitted-patient day.
 *
 * Layout (matches the physical FEFSA form):
 *   ┌─────────────────────────── Day N — Date DD/MM/YY ──────────────────┐
 *   │  MEDICINES (14 lines × 4 cols)      │  VITALS (Time / Pulse / BP / │
 *   │  #  Medicine  Dose  Route  Freq     │  SpO₂ across 10 AM · 4 PM ·  │
 *   │  1  ...                              │  10 PM · 6 AM slots)         │
 *   │  ...                                 │                              │
 *   │                                      │  Steam    [AM] [PM]          │
 *   │                                      │  Chest PT [AM] [PM]          │
 *   └──────────────────────────────────────────────────────────────────────┘
 *   [ + Add another day ]
 *
 * Blocks below the last recorded/DOD-bounded day render on demand: click the
 * "+" button to seed a new blank block for the next calendar day. Save posts
 * every non-empty block; the doctor (ADMIN) opens the same URL and refreshes
 * to see what reception recorded.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Stack, Button, IconButton,
  CircularProgress, Alert, Divider, Chip, Tooltip, Table, TableHead,
  TableRow, TableCell, TableBody, Autocomplete, TextField,
} from '@mui/material';
import MedicationOutlinedIcon from '@mui/icons-material/MedicationOutlined';
import SaveIcon from '@mui/icons-material/Save';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import dayjs from 'dayjs';

import { ipdApi, settingsApi, mastersApi } from '../services/endpoints.js';
import { authHeader } from '../services/api.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const MED_ROWS = 14;
const SLOT_LABELS = ['10 AM', '4 PM', '10 PM', '6 AM'];
const SLOT_KEYS   = ['10am',  '4pm',  '10pm',  '6am'];

// Kept in sync with the prescription screen (DoctorVisit.jsx) so the
// choices staff see here are the same ones the doctor uses. If we ever
// promote this to a master table, both places should read from it.
const FREQ_OPTIONS = [
  '1-0-0', '0-1-0', '0-0-1',
  '1-0-1', '1-1-1', '1-1-0', '0-1-1',
  '2-0-2', '2-2-2',
  '1/2-0-1/2',
  'SOS',
];

// No master table for dose amounts or routes yet — use these as a friendly
// starting set. freeSolo means staff can still type anything.
const DOSE_OPTIONS  = ['500 mg', '250 mg', '100 mg', '650 mg', '1 tab', '1/2 tab', '2 tab', '5 ml', '10 ml'];
const ROUTE_OPTIONS = ['PO', 'IV', 'IM', 'SC', 'Neb', 'Topical'];

const blankLines = () =>
  Array.from({ length: MED_ROWS }, () => ({ med: '', dose: '', route: '', freq: '' }));

const padLines = (lines) => {
  const arr = Array.isArray(lines) ? lines.slice(0, MED_ROWS) : [];
  while (arr.length < MED_ROWS) arr.push({ med: '', dose: '', route: '', freq: '' });
  return arr.map((l) => ({
    med:   l?.med   || '',
    dose:  l?.dose  || '',
    route: l?.route || '',
    freq:  l?.freq  || '',
  }));
};

const emptyBlock = (readingDate, inStay = true) => ({
  readingDate,
  inStay,
  pulse10am: '', bp10am: '', spo210am: '',
  pulse4pm:  '', bp4pm:  '', spo24pm:  '',
  pulse10pm: '', bp10pm: '', spo210pm: '',
  pulse6am:  '', bp6am:  '', spo26am:  '',
  medicineLines: blankLines(),
  steam: 0, chestPt: 0, steamPm: 0, chestPtPm: 0,
});

const hydrate = (existing) => ({
  ...emptyBlock(dayjs(existing.readingDate).format('YYYY-MM-DD')),
  ...existing,
  readingDate: dayjs(existing.readingDate).format('YYYY-MM-DD'),
  medicineLines: padLines(existing.medicineLines),
});

// Build one block per calendar day between DOA and (DOD || today), plus
// merge in anything already saved on the server.
const buildInitial = (admission, days) => {
  const byDate = new Map(
    (days || []).map((d) => [dayjs(d.readingDate).format('YYYY-MM-DD'), d])
  );
  const start = admission?.admittedAt ? dayjs(admission.admittedAt).startOf('day') : dayjs().startOf('day');
  const endBoundary = admission?.dischargedAt ? dayjs(admission.dischargedAt).startOf('day') : dayjs().startOf('day');
  const stayDays = Math.max(1, endBoundary.diff(start, 'day') + 1);

  // Union of "days in stay" and "days already recorded" (recorded ones might
  // fall outside the stay window if someone back/forward-dates them).
  const dates = new Set();
  for (let i = 0; i < stayDays; i++) dates.add(start.add(i, 'day').format('YYYY-MM-DD'));
  for (const iso of byDate.keys()) dates.add(iso);
  const sorted = [...dates].sort();
  return sorted.map((iso, idx) => {
    const inStay = idx < stayDays;
    return byDate.has(iso) ? hydrate({ ...emptyBlock(iso, inStay), ...byDate.get(iso) })
                           : emptyBlock(iso, inStay);
  });
};

const blockHasContent = (b) =>
  ['pulse10am','bp10am','spo210am','pulse4pm','bp4pm','spo24pm',
   'pulse10pm','bp10pm','spo210pm','pulse6am','bp6am','spo26am']
    .some((k) => String(b[k] ?? '').trim() !== '')
  || (b.medicineLines || []).some((l) => l.med || l.dose || l.route || l.freq)
  || Number(b.steam || 0) > 0 || Number(b.chestPt || 0) > 0
  || Number(b.steamPm || 0) > 0 || Number(b.chestPtPm || 0) > 0;

export default function IndoorSheet() {
  const { admissionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [admission, setAdmission] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [settings, setSettings] = useState({ clinic_name: 'FEFSA HOSPITAL', doctor_name: 'Dr. Ajit B. Patel' });
  const [medOptions, setMedOptions] = useState([]);

  const canEdit = user?.role === 'ADMIN' || user?.role === 'RECEPTIONIST';

  // Reception's job is data entry, so land them straight in Edit mode.
  // Admin (doctor) reviews — land them in View mode; they can flip to Edit
  // if they need to correct something. MO is view-only always.
  const [mode, setMode] = useState(() =>
    user?.role === 'RECEPTIONIST' ? 'edit' : 'view'
  );
  const isView = mode === 'view';
  const readOnly = isView || !canEdit;

  useEffect(() => {
    settingsApi.get().then(setSettings).catch(() => null);
    // Same source the prescription (DoctorVisit) reads from — the medicine
    // master. Falls back silently if the endpoint is unreachable.
    mastersApi.list('medicine_master')
      .then((rows) => setMedOptions((rows || []).map((r) => r.name).filter(Boolean)))
      .catch(() => setMedOptions([]));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await ipdApi.indoorSheet.get(admissionId);
      setAdmission(r.admission);
      setBlocks(buildInitial(r.admission, r.days));
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load sheet', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [admissionId]); // eslint-disable-line

  const patch = (idx, updater) =>
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, ...updater(b) } : b)));

  const patchLine = (blockIdx, lineIdx, key, value) =>
    setBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== blockIdx) return b;
        const lines = b.medicineLines.slice();
        lines[lineIdx] = { ...lines[lineIdx], [key]: value };
        return { ...b, medicineLines: lines };
      })
    );

  const addDay = () => {
    setBlocks((prev) => {
      // Next day after the last block, or today if there are none.
      const lastDate = prev.length
        ? dayjs(prev[prev.length - 1].readingDate)
        : dayjs();
      const nextDate = lastDate.add(1, 'day').format('YYYY-MM-DD');
      // If it's already there (e.g., the user clicked twice), don't duplicate.
      if (prev.some((b) => b.readingDate === nextDate)) return prev;
      return [...prev, emptyBlock(nextDate, true)];
    });
  };

  /**
   * Copy the medicine list from the previous day-block into this one. Saves
   * reception from re-typing the whole regimen every morning when treatment
   * is unchanged. Vitals and steam/chest-PT counters stay put — only the
   * medicine table is affected. Anything already in this day's medicine
   * table is overwritten by the previous day's list.
   */
  const copyMedsFromPrev = (idx) => {
    if (idx <= 0) return;
    setBlocks((prev) => {
      const src = prev[idx - 1]?.medicineLines || [];
      const filled = src.filter((l) => l.med || l.dose || l.route || l.freq);
      if (filled.length === 0) {
        notify('The previous day has no medicines to copy.', 'info');
        return prev;
      }
      // Deep-copy each line so future edits on one day don't cross-mutate
      // the other. Pad back up to the standard 15 rows so the table still
      // renders cleanly.
      const copied = padLines(src.map((l) => ({ ...l })));
      const fromDate = dayjs(prev[idx - 1].readingDate).format('DD/MM/YY');
      const toDate   = dayjs(prev[idx].readingDate).format('DD/MM/YY');
      notify(`Copied ${filled.length} medicine(s) from ${fromDate} to ${toDate}.`, 'success');
      return prev.map((b, i) => (i === idx ? { ...b, medicineLines: copied } : b));
    });
  };

  /**
   * Clear every medicine row for this day-block (empty table stays put so
   * reception can start entering fresh entries). Vitals and counters stay
   * — same "only medicines" scope as copyMedsFromPrev.
   */
  const clearMeds = (idx) => {
    setBlocks((prev) => {
      const target = prev[idx];
      if (!target) return prev;
      const hadAny = (target.medicineLines || []).some((l) =>
        l.med || l.dose || l.route || l.freq);
      if (!hadAny) {
        notify('No medicines to clear on this day.', 'info');
        return prev;
      }
      const dateLabel = dayjs(target.readingDate).format('DD/MM/YY');
      notify(`Cleared all medicines from ${dateLabel}.`, 'success');
      return prev.map((b, i) => (i === idx ? { ...b, medicineLines: blankLines() } : b));
    });
  };

  const removeBlock = async (idx) => {
    const b = blocks[idx];
    // Empty blocks have nothing to delete server-side; skip the confirm hop
    // by clearing them client-side straight away. Rows with real content
    // trigger the global "Delete this record?" dialog from api.js.
    if (!blockHasContent(b)) {
      setBlocks((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    try {
      await ipdApi.indoorSheet.deleteDay(admissionId, b.readingDate);
    } catch (e) {
      if (e?.cancelled) return;
      notify(e?.response?.data?.message || 'Delete failed', 'error');
      return;
    }
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = blocks.filter(blockHasContent).map((b) => ({
        readingDate: b.readingDate,
        pulse10am: b.pulse10am, bp10am: b.bp10am, spo210am: b.spo210am,
        pulse4pm:  b.pulse4pm,  bp4pm:  b.bp4pm,  spo24pm:  b.spo24pm,
        pulse10pm: b.pulse10pm, bp10pm: b.bp10pm, spo210pm: b.spo210pm,
        pulse6am:  b.pulse6am,  bp6am:  b.bp6am,  spo26am:  b.spo26am,
        medicineLines: b.medicineLines.filter((l) => l.med || l.dose || l.route || l.freq),
        steam:     Number(b.steam)     || 0,
        chestPt:   Number(b.chestPt)   || 0,
        steamPm:   Number(b.steamPm)   || 0,
        chestPtPm: Number(b.chestPtPm) || 0,
      }));
      const res = await ipdApi.indoorSheet.save(admissionId, payload);
      notify(`Saved ${res.written} day${res.written === 1 ? '' : 's'} — the doctor sees this now.`, 'success');
      await load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    const r = await fetch(ipdApi.indoorSheet.pdfUrl(admissionId), {
      headers: authHeader(),
    });
    if (!r.ok) return notify('Failed to download PDF', 'error');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const dayNumberFor = useMemo(() => {
    if (!admission?.admittedAt) return () => 1;
    const doa = dayjs(admission.admittedAt).startOf('day');
    return (iso) => dayjs(iso).startOf('day').diff(doa, 'day') + 1;
  }, [admission?.admittedAt]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (!admission) return null;

  const ageSex = `${admission.age || ''}${admission.gender ? ' / ' + admission.gender : ''}`;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>Back</Button>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {canEdit && (
            // Toggle between clean View mode (admin's default) and Edit
            // mode (reception's default). Everyone else stays in View.
            <Button
              variant={isView ? 'outlined' : 'contained'}
              color={isView ? 'primary' : 'warning'}
              startIcon={isView ? <EditIcon /> : <VisibilityIcon />}
              onClick={() => setMode(isView ? 'edit' : 'view')}
            >
              {isView ? 'Edit mode' : 'View mode'}
            </Button>
          )}
          <Button variant="outlined" startIcon={<PictureAsPdfIcon />} onClick={downloadPdf}>
            Print / PDF
          </Button>
          {canEdit && !isView && (
            <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
              {saving ? <CircularProgress size={18} color="inherit" /> : 'Save'}
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Letterhead + patient info — same visual language as the OPD register */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {/* position: relative so the absolutely-centered INDOOR SHEET chip
              lands on the true horizontal midpoint of the letterhead, not
              wherever the clinic-info flex column happens to end. */}
          <Stack direction="row" alignItems="center" spacing={2}
                 sx={{ pb: 2, borderBottom: '2px solid #0d527e', position: 'relative' }}>
            <Box
              component="img"
              src={settingsApi.logoUrl()}
              alt="Logo"
              sx={{ height: 64, width: 64, objectFit: 'contain', bgcolor: '#fff' }}
              onError={(e) => { e.target.src = '/logo.png'; }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5"
                sx={{ fontWeight: 800, letterSpacing: 0.5, color: '#0d527e', textTransform: 'uppercase', lineHeight: 1 }}>
                {settings.clinic_name || 'FEFSA HOSPITAL'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {settings.clinic_address || 'B1-Block, Medipolis, Deesa Highway, Palanpur-385001 (Dist. B.K.)'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Mo. {settings.clinic_phone || '90 99 41 66 82, 88 66 44 48 17'}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right', minWidth: 170 }}>
              <Typography sx={{ fontWeight: 700 }}>
                {settings.doctor_name || 'Dr. Ajit B. Patel'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>MB. DTCD (Chest)</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Reg. No. G-32059</Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>Consulting Pulmonologist</Typography>
            </Box>
            {/* Truly centered INDOOR SHEET chip — positioned last so it
                paints on top of the flex row and stays on the visual axis. */}
            <Box sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              border: '1.5px solid #0d527e', borderRadius: 1, px: 2.5, py: 0.75,
              fontWeight: 800, letterSpacing: 1, color: '#0d527e',
              bgcolor: '#fff',
              // Slight shadow so it reads as a foreground element even when
              // it sits over the horizontal rule below.
              boxShadow: '0 1px 3px rgba(13,82,126,0.08)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}>
              INDOOR SHEET
            </Box>
          </Stack>

          <Box sx={{ mt: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 1 }}>
              <Field label="Name"    value={admission.patientName}   flex={2.5} />
              <Field label="Age/Sex" value={ageSex}                  flex={1} />
              <Field label="Room"    value={admission.bedNumber}     flex={0.7} />
              <Field label="Ward"    value={admission.wardName}      flex={1.2} />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 1 }}>
              <Field label="Address" value={admission.village || '—'} flex={3} />
              <Field label="DOA"     value={admission.admittedAt ? dayjs(admission.admittedAt).format('DD/MM/YY') : '—'} flex={1} />
              <Field label="DOD"     value={admission.dischargedAt ? dayjs(admission.dischargedAt).format('DD/MM/YY') : '—'} flex={1} />
            </Stack>
            <Field label="Diagnosis" value={admission.admissionDiagnosis || '—'} />
          </Box>

          {!canEdit && (
            <Alert severity="info" sx={{ mt: 2 }}>Read-only view for your role.</Alert>
          )}
          {canEdit && (
            <Alert severity={isView ? 'success' : 'warning'} sx={{ mt: 2 }} variant="outlined">
              {isView
                ? 'View mode — clean read-only presentation. Click "Edit mode" if you need to change anything.'
                : 'Edit mode — enter or correct vitals, medicines and counters. Click "Save" when done.'}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Day blocks */}
      <Stack spacing={2}>
        {blocks
          // In View mode, only surface days that actually have data — the
          // paper form doesn't show empty stub rows.
          .map((b, idx) => ({ b, idx }))
          .filter(({ b }) => !isView || blockHasContent(b))
          .map(({ b, idx }) => (
            isView ? (
              <DayBlockView
                key={`${b.readingDate}-${idx}`}
                block={b}
                dayNumber={dayNumberFor(b.readingDate)}
              />
            ) : (
              <DayBlock
                key={`${b.readingDate}-${idx}`}
                block={b}
                index={idx}
                dayNumber={dayNumberFor(b.readingDate)}
                disabled={!canEdit}
                medOptions={medOptions}
                onFieldChange={(u) => patch(idx, u)}
                onLineChange={(lineIdx, key, value) => patchLine(idx, lineIdx, key, value)}
                onRemove={() => removeBlock(idx)}
                canCopyPrev={idx > 0}
                onCopyPrevMeds={() => copyMedsFromPrev(idx)}
                onClearMeds={() => clearMeds(idx)}
              />
            )
          ))}

        {isView && !blocks.some(blockHasContent) && (
          <Alert severity="info">
            No entries recorded yet. Switch to Edit mode to add vitals for the first day.
          </Alert>
        )}

        {canEdit && !isView && (
          <Box sx={{ textAlign: 'center' }}>
            <Button variant="outlined" size="large" startIcon={<AddIcon />} onClick={addDay}>
              Add another day
            </Button>
          </Box>
        )}
      </Stack>
    </Box>
  );
}

function Field({ label, value, flex = 1 }) {
  return (
    <Box sx={{ flex, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{
        fontWeight: 600, borderBottom: '1px solid #cfd6de', minHeight: 22, whiteSpace: 'pre-wrap',
      }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

/* ------------------------- Day block ------------------------- */

function DayBlock({
  block, index, dayNumber, disabled, medOptions = [],
  onFieldChange, onLineChange, onRemove,
  canCopyPrev = false, onCopyPrevMeds, onClearMeds,
}) {
  // Datalist IDs are scoped to this block so the dropdown doesn't get
  // confused when multiple day blocks are on the page at once.
  const medListId   = `med-opts-${index}`;
  const doseListId  = `dose-opts-${index}`;
  const routeListId = `route-opts-${index}`;
  const freqListId  = `freq-opts-${index}`;

  return (
    <Card variant="outlined" sx={{ borderColor: '#c8d5e2', overflow: 'hidden' }}>
      {/* Header strip — Day N + date + delete */}
      <Box sx={{
        px: 2, py: 1, bgcolor: '#eef4fb',
        display: 'flex', alignItems: 'center', gap: 1,
        borderBottom: '1px solid #c8d5e2',
      }}>
        <Chip label={`Day ${dayNumber}`} size="small" color="primary" sx={{ fontWeight: 700 }} />
        <Typography sx={{ fontWeight: 600 }}>
          {dayjs(block.readingDate).format('dddd, DD/MM/YY')}
        </Typography>
        {!block.inStay && (
          <Chip size="small" label="Outside admission window" variant="outlined" color="warning" />
        )}
        <Box sx={{ flex: 1 }} />
        {!disabled && canCopyPrev && (
          <Tooltip title="Copy every medicine row from the previous day into this one. Overwrites anything already in this day's medicine table.">
            <Button
              size="small"
              variant="outlined"
              color="primary"
              startIcon={<ContentCopyIcon fontSize="small" />}
              onClick={onCopyPrevMeds}
            >
              Copy Previous Day's Medicines
            </Button>
          </Tooltip>
        )}
        {!disabled && (
          <Tooltip title="Clear every medicine row from this day. Vitals and steam/chest-PT counters are kept.">
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<DeleteOutlineIcon fontSize="small" />}
              onClick={onClearMeds}
            >
              Clear Medicines
            </Button>
          </Tooltip>
        )}
        {!disabled && (
          <Tooltip title="Remove this whole day block from the sheet">
            <IconButton size="small" onClick={onRemove} sx={{ color: 'error.main' }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Two-column body: medicines (left) + vitals (right) */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.5fr) minmax(0,1fr)' },
        gap: 0,
      }}>
        {/* MEDICINES */}
        <Box sx={{ borderRight: { lg: '1px solid #e4e9ef' }, p: 1.5 }}>
          <Typography variant="overline"
            sx={{ display: 'block', fontWeight: 700, letterSpacing: 1, color: 'text.secondary', mb: 0.5 }}>
            Medicines
          </Typography>
          <Box sx={{ border: '1px solid #d9dde3', borderRadius: 1 }}>
            <Table size="small" sx={{ '& th, & td': { borderColor: '#e4e9ef', p: 0.5 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f7fb' }}>
                  <TableCell align="center" sx={{ width: 32, fontWeight: 700 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Medicine</TableCell>
                  <TableCell align="center" sx={{ width: 80, fontWeight: 700 }}>Dose</TableCell>
                  <TableCell align="center" sx={{ width: 80, fontWeight: 700 }}>Route</TableCell>
                  <TableCell align="center" sx={{ width: 90, fontWeight: 700 }}>Freq</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {block.medicineLines.map((l, li) => (
                  <TableRow key={li} hover>
                    <TableCell align="center" sx={{ color: 'text.secondary', fontSize: 12 }}>{li + 1}</TableCell>
                    <TableCell>
                      <MedicineCell
                        value={l.med}
                        disabled={disabled}
                        options={medOptions}
                        onChange={(v) => onLineChange(li, 'med', v)}
                      />
                    </TableCell>
                    <TableCell>
                      <InputCell value={l.dose} disabled={disabled} align="center" listId={doseListId}
                        onChange={(v) => onLineChange(li, 'dose', v)} placeholder="500 mg" />
                    </TableCell>
                    <TableCell>
                      <InputCell value={l.route} disabled={disabled} align="center" listId={routeListId}
                        onChange={(v) => onLineChange(li, 'route', v)} placeholder="PO/IV" />
                    </TableCell>
                    <TableCell>
                      <InputCell value={l.freq} disabled={disabled} align="center" listId={freqListId}
                        onChange={(v) => onLineChange(li, 'freq', v)} placeholder="1-0-1" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          {/* Shared datalists for dose / route / freq (compact InputCells).
              The Medicine column uses a proper MUI Autocomplete component
              instead — see MedicineCell — so no datalist for it here. */}
          <datalist id={doseListId}>
            {DOSE_OPTIONS.map((d) => <option key={d} value={d} />)}
          </datalist>
          <datalist id={routeListId}>
            {ROUTE_OPTIONS.map((r) => <option key={r} value={r} />)}
          </datalist>
          <datalist id={freqListId}>
            {FREQ_OPTIONS.map((f) => <option key={f} value={f} />)}
          </datalist>
        </Box>

        {/* VITALS + STEAM + CHEST PT */}
        <Box sx={{ p: 1.5 }}>
          <Typography variant="overline"
            sx={{ display: 'block', fontWeight: 700, letterSpacing: 1, color: 'text.secondary', mb: 0.5 }}>
            Vitals
          </Typography>
          <Box sx={{ border: '1px solid #d9dde3', borderRadius: 1 }}>
            <Table size="small" sx={{ '& th, & td': { borderColor: '#e4e9ef', p: 0.5 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f7fb' }}>
                  <TableCell align="center" sx={{ fontWeight: 700, width: 72 }}>Time</TableCell>
                  {SLOT_LABELS.map((l) => (
                    <TableCell key={l} align="center" sx={{ fontWeight: 700 }}>{l}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {['Pulse', 'BP', 'SpO₂'].map((vLabel) => {
                  const vKey = vLabel === 'Pulse' ? 'pulse' : vLabel === 'BP' ? 'bp' : 'spo2';
                  return (
                    <TableRow key={vKey}>
                      <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#fafbfc' }}>
                        {vLabel}
                      </TableCell>
                      {SLOT_KEYS.map((sk) => {
                        const fieldKey = `${vKey}${sk}`;
                        return (
                          <TableCell key={fieldKey}>
                            <InputCell
                              value={block[fieldKey]}
                              disabled={disabled}
                              align="center" full
                              onChange={(v) => onFieldChange(() => ({ [fieldKey]: v }))}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>

          <Box sx={{
            mt: 2, p: 1.25, border: '1px dashed #c8d5e2', borderRadius: 1,
            bgcolor: '#fafbfc',
          }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography sx={{ fontWeight: 700, minWidth: 88 }}>Steam</Typography>
              <BoxNumber value={block.steam}   disabled={disabled}
                onChange={(v) => onFieldChange(() => ({ steam: v }))} label="AM" />
              <BoxNumber value={block.steamPm} disabled={disabled}
                onChange={(v) => onFieldChange(() => ({ steamPm: v }))} label="PM" />
            </Stack>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1 }}>
              <Typography sx={{ fontWeight: 700, minWidth: 88 }}>Chest P.T.</Typography>
              <BoxNumber value={block.chestPt}   disabled={disabled}
                onChange={(v) => onFieldChange(() => ({ chestPt: v }))} label="AM" />
              <BoxNumber value={block.chestPtPm} disabled={disabled}
                onChange={(v) => onFieldChange(() => ({ chestPtPm: v }))} label="PM" />
            </Stack>
          </Box>
        </Box>
      </Box>
    </Card>
  );
}

/* ------------------------- View-mode day block -------------------------
 *
 * Cleaner, print-like presentation for the admin/doctor. Empty rows are
 * hidden, medicine lines render as sentences, and vitals show as a compact
 * table with dashes for un-recorded slots. Nothing is editable here.
 * ---------------------------------------------------------------------- */

function DayBlockView({ block, dayNumber }) {
  const lines = (block.medicineLines || []).filter(
    (l) => l.med || l.dose || l.route || l.freq
  );
  const vitalRows = [
    { label: '10 AM', p: block.pulse10am, b: block.bp10am, s: block.spo210am },
    { label: '4 PM',  p: block.pulse4pm,  b: block.bp4pm,  s: block.spo24pm  },
    { label: '10 PM', p: block.pulse10pm, b: block.bp10pm, s: block.spo210pm },
    { label: '6 AM',  p: block.pulse6am,  b: block.bp6am,  s: block.spo26am  },
  ];
  const hasAnyVital = vitalRows.some((r) => r.p || r.b || r.s);
  const steamTotal = (Number(block.steam) || 0) + (Number(block.steamPm) || 0);
  const ptTotal    = (Number(block.chestPt) || 0) + (Number(block.chestPtPm) || 0);

  return (
    <Card variant="outlined" sx={{ borderColor: '#c8d5e2', overflow: 'hidden' }}>
      <Box sx={{
        px: 2, py: 1, bgcolor: '#eef4fb',
        display: 'flex', alignItems: 'center', gap: 1,
        borderBottom: '1px solid #c8d5e2',
      }}>
        <Chip label={`Day ${dayNumber}`} size="small" color="primary" sx={{ fontWeight: 700 }} />
        <Typography sx={{ fontWeight: 600 }}>
          {dayjs(block.readingDate).format('dddd, DD/MM/YY')}
        </Typography>
      </Box>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,1.4fr) minmax(0,1fr)' },
        gap: 0,
      }}>
        {/* Medicines */}
        <Box sx={{ borderRight: { lg: '1px solid #e4e9ef' }, p: 2 }}>
          <Typography variant="overline" sx={{ display: 'block', fontWeight: 700, letterSpacing: 1, color: 'text.secondary', mb: 1 }}>
            Medicines
          </Typography>
          {lines.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              No medicines recorded.
            </Typography>
          ) : (
            <Box component="ol" sx={{ m: 0, pl: 3 }}>
              {lines.map((l, i) => (
                <Box component="li" key={i} sx={{ mb: 0.5, lineHeight: 1.6 }}>
                  <Typography component="span" sx={{ fontWeight: 600 }}>{l.med || '—'}</Typography>
                  {(l.dose || l.route || l.freq) && (
                    <Typography component="span" color="text.secondary">
                      {' — '}
                      {[l.dose, l.route, l.freq].filter(Boolean).join(' · ')}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Vitals + counters */}
        <Box sx={{ p: 2 }}>
          <Typography variant="overline" sx={{ display: 'block', fontWeight: 700, letterSpacing: 1, color: 'text.secondary', mb: 1 }}>
            Vitals
          </Typography>
          {!hasAnyVital ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
              No vitals recorded.
            </Typography>
          ) : (
            <Box sx={{ border: '1px solid #d9dde3', borderRadius: 1, mb: 2 }}>
              <Table size="small" sx={{ '& th, & td': { borderColor: '#e4e9ef', p: 0.75 } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f7fb' }}>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>Time</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>Pulse</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>BP</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>SpO₂</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vitalRows.map((r) => (
                    <TableRow key={r.label}>
                      <TableCell align="center" sx={{ fontWeight: 600, bgcolor: '#fafbfc', width: 70 }}>
                        {r.label}
                      </TableCell>
                      <TableCell align="center">{r.p || '—'}</TableCell>
                      <TableCell align="center">{r.b || '—'}</TableCell>
                      <TableCell align="center">{r.s || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <SummaryPill
              label="Steam"
              total={steamTotal}
              am={block.steam || 0}
              pm={block.steamPm || 0}
            />
            <SummaryPill
              label="Chest P.T."
              total={ptTotal}
              am={block.chestPt || 0}
              pm={block.chestPtPm || 0}
            />
          </Stack>
        </Box>
      </Box>
    </Card>
  );
}

function SummaryPill({ label, total, am, pm }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 1.5, py: 0.75, border: '1px solid #dbe3ec', borderRadius: 999,
      bgcolor: total > 0 ? '#eef7f1' : '#f6f8fb',
    }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 800, color: total > 0 ? '#0b7a4a' : 'text.secondary' }}>
        {total}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        (AM {am} · PM {pm})
      </Typography>
    </Box>
  );
}

// Tight inline input — chosen over MUI TextField because the grid gets
// really cramped with 20+ inputs per day. When `listId` is supplied the
// browser renders a native suggestion dropdown backed by <datalist>; the
// user can still type any free-form value.
function InputCell({ value, onChange, disabled, align = 'left', full = false, placeholder = '', type = 'text', listId }) {
  return (
    <input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      type={type}
      list={listId}
      style={{
        width: full ? '100%' : 72,
        boxSizing: 'border-box',
        border: '1px solid transparent',
        borderBottom: '1px solid #dfe3ea',
        padding: '4px 6px', fontSize: 13,
        background: 'transparent', outline: 'none',
        textAlign: align,
      }}
      onFocus={(e) => { e.target.style.background = '#f0f7ff'; e.target.style.border = '1px solid #0d527e'; }}
      onBlur={(e)  => { e.target.style.background = 'transparent'; e.target.style.border = '1px solid transparent'; e.target.style.borderBottom = '1px solid #dfe3ea'; }}
    />
  );
}

/**
 * Medicine picker for a single row of the medicines table. MUI Autocomplete
 * gives a properly-styled, themed dropdown (light background, readable
 * text) instead of the browser's native <datalist> chrome which shows up
 * in a jarring dark colour on some OS themes. `freeSolo` keeps it flexible
 * — reception can still type anything not in the master list.
 */
function MedicineCell({ value, onChange, disabled, options = [] }) {
  return (
    <Autocomplete
      freeSolo
      size="small"
      disableClearable
      value={value || ''}
      options={options}
      onChange={(_, v) => onChange(v ?? '')}
      onInputChange={(_, v, reason) => {
        // Only propagate free-typing; 'reset' fires after an option is picked
        // and would echo the value back in a loop otherwise.
        if (reason === 'input' || reason === 'clear') onChange(v ?? '');
      }}
      disabled={disabled}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 1.5,
            boxShadow: '0 12px 28px -12px rgba(15,23,42,0.25)',
            border: '1px solid #e2e8f0',
          },
        },
        listbox: {
          sx: {
            maxHeight: 300,
            py: 0.5,
            '& .MuiAutocomplete-option': {
              fontSize: 13,
              py: 0.75,
              px: 1.25,
              gap: 1,
              '&[aria-selected="true"]': { bgcolor: 'rgba(11,122,74,0.10)' },
              '&.Mui-focused':          { bgcolor: 'rgba(11,122,74,0.06)' },
            },
          },
        },
      }}
      renderOption={(props, option) => (
        <li {...props} key={option}>
          <MedicationOutlinedIcon fontSize="small" sx={{ color: 'primary.main' }} />
          <Typography variant="body2">{option}</Typography>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          placeholder="e.g. Azithro 500"
          InputProps={{
            ...params.InputProps,
            disableUnderline: false,
            sx: {
              fontSize: 13,
              px: 0.5,
              '&:before': { borderBottomColor: '#dfe3ea' },
              '& input': { py: '4px' },
            },
          }}
        />
      )}
    />
  );
}

function BoxNumber({ value, onChange, disabled, label }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <input
        value={value ?? 0}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        type="number"
        min={0}
        style={{
          width: 48, boxSizing: 'border-box',
          border: '1.5px solid #cbd5e0', borderRadius: 4,
          padding: '4px 6px', fontSize: 14, fontWeight: 700,
          textAlign: 'center', background: '#fff', outline: 'none',
        }}
      />
    </Stack>
  );
}
