import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Box, Card, CardContent, Grid, Typography, TextField, Button, Chip,
  CircularProgress, ToggleButtonGroup, ToggleButton, Autocomplete, Divider,
  Stack, IconButton, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';

import {
  visitsApi, doctorApi, mastersApi, patientsApi, printApi, diseaseTemplatesApi, ipdApi,
} from '../services/endpoints.js';
import { authHeader } from '../services/api.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const Row = ({ label, value }) => (
  <Box sx={{ display: 'flex', gap: 1 }}>
    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 500 }}>{value || '—'}</Typography>
  </Box>
);

/* -----------------------------------------------------------------
 *  Prescription helpers
 * ----------------------------------------------------------------- */

// Monotonic counter to give each medicine row a stable, unique key. This
// matters because MUI Autocomplete keeps its own display text alive when
// React reuses an instance across renders — if we key by index, removing
// a template row and padding with a blank leaves the OLD medicine name
// visible in the input box. Keying by _rowId forces a real remount.
let _rowSeq = 0;
const nextRowId = () => `row-${++_rowSeq}-${Date.now()}`;

// One blank medicine row.
const blankMed = () => ({
  _rowId: nextRowId(),
  option: null,
  medicineName: '',
  dosage: '',
  intake: 'After Food',
  days: '',
  qty: '',
  remarks: '',
  qtyEdited: false,
});

// Common dosage patterns the doctor can quick-pick from. freeSolo also
// lets them type any custom value.
const DOSAGE_OPTIONS = [
  '1-0-0', '0-1-0', '0-0-1',
  '1-0-1', '1-1-1', '1-1-0', '0-1-1',
  '2-0-2', '2-2-2',
  '1/2-0-1/2',
  'SOS',
];

// Parse a "X-Y-Z" dose into a total-per-day number. Supports fractions
// ("1/2") and plain integers. Returns null if not parseable.
const parseDose = (s) => {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d+(?:\.\d+)?(?:\/\d+)?)-(\d+(?:\.\d+)?(?:\/\d+)?)-(\d+(?:\.\d+)?(?:\/\d+)?)$/);
  if (!m) return null;
  const toNum = (x) => {
    if (x.includes('/')) {
      const [a, b] = x.split('/').map(Number);
      return b ? a / b : 0;
    }
    return Number(x);
  };
  return toNum(m[1]) + toNum(m[2]) + toNum(m[3]);
};

// Total qty implied by `dosage` × `days`. Fractions are rounded *up* to the
// nearest whole tablet so the patient never runs short.
const calcQty = (dosage, days) => {
  const per = parseDose(dosage);
  const d = Number(days);
  if (per == null || !d || d <= 0) return '';
  const total = per * d;
  return Number.isInteger(total) ? total : Math.ceil(total);
};

/**
 * Auto follow-up date.
 *
 * Schedule the patient to return **5 days before** the longest prescribed
 * course ends — that gives them a refill window before their meds run out.
 * If the calculated date lands on a Sunday (clinic closed) we shift it
 * back to the previous Saturday, never forward, so the patient still has
 * a buffer of medicine on hand.
 *
 * Returns null when no medicine has a usable Days value (we leave the
 * picker empty and let the doctor decide manually).
 */
const computeAutoFollowup = (medList) => {
  const maxDays = medList.reduce((max, m) => {
    const d = parseInt(m.days, 10);
    return Number.isNaN(d) || d <= 0 ? max : Math.max(max, d);
  }, 0);
  if (maxDays < 6) return null;                  // short courses: no auto schedule
  let date = dayjs().startOf('day').add(maxDays - 5, 'day');
  if (date.day() === 0) date = date.subtract(1, 'day');     // Sunday → Saturday
  return date;
};

/* -----------------------------------------------------------------
 * Shared "chip-style" toggle styling used by the Examination and
 * Investigation panels. Boxes have a clearly visible outline, lift
 * on hover, and switch to a soft light-grey fill when selected so
 * the doctor can see at a glance what's been picked.
 * ----------------------------------------------------------------- */
const chipGroupSx = {
  flexWrap: 'wrap',
  gap: 1,
  // ToggleButtonGroup forces sibling buttons to share rounded ends
  // — override so each chip keeps its own rounded outline.
  '& .MuiToggleButtonGroup-grouped': {
    border: '1px solid #d7e7df !important',
    borderRadius: '999px !important',
    mx: 0,
  },
  // Selected chips get a green outline that wins over the default border.
  '& .MuiToggleButtonGroup-grouped.Mui-selected': {
    border: '1.5px solid #1a9162 !important',
  },
};

const chipSx = {
  textTransform: 'none',
  fontWeight: 500,
  px: 2,
  py: 0.75,
  color: 'text.primary',
  borderRadius: 999,
  bgcolor: '#fff',
  transition: 'background-color .2s ease, border-color .2s ease, box-shadow .2s ease, transform .15s ease',
  '&:hover': {
    bgcolor: '#f5f7f6',
    borderColor: '#b8cfc4 !important',
    transform: 'translateY(-1px)',
  },
  '&.Mui-selected': {
    // Distinct green selection so picked chips read at a glance against
    // the row of un-picked ones.
    bgcolor: '#d6f0e1',
    borderColor: '#1a9162 !important',
    color: '#0b4d33',
    fontWeight: 700,
    boxShadow: 'inset 0 0 0 1px #1a9162',
    '&:hover': {
      bgcolor: '#c4e9d3',
      borderColor: '#0b7a4a !important',
    },
  },
};

export default function DoctorVisit() {
  const { visitId } = useParams();
  const navigate = useNavigate();
  const { notify } = useSnackbar();

  const [visit, setVisit] = useState(null);
  const [history, setHistory] = useState(null);
  const [examMaster, setExamMaster] = useState([]);
  const [investigationMaster, setInvestigationMaster] = useState([]);
  const [planMaster, setPlanMaster] = useState([]);
  const [medicineMaster, setMedicineMaster] = useState([]);
  const [adviceMaster, setAdviceMaster] = useState([]);
  const [diseaseList, setDiseaseList] = useState([]);
  // Diseases (chip values) whose template has already been applied — used
  // to visually mark the chip as selected without re-appending on click.
  const [appliedDiseaseIds, setAppliedDiseaseIds] = useState([]);

  const [examination, setExamination] = useState([]);
  const [investigation, setInvestigation] = useState([]);
  const [plan, setPlan] = useState([]);
  // Always start with at least 5 visible rows; doctor can +Add more.
  const [medicines, setMedicines] = useState(
    () => Array.from({ length: 5 }, () => blankMed())
  );
  const [advices, setAdvices] = useState([]);
  const [followupDate, setFollowupDate] = useState(null);
  // True while the follow-up date is being auto-calculated from the longest
  // medicine course. Switches to false the moment the doctor edits the
  // picker manually, so we never overwrite their explicit choice.
  const [followupAuto, setFollowupAuto] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, watch } = useForm();
  const formValues = watch();

  // 5-second auto-save draft for Doctor consultation
  useEffect(() => {
    if (!visitId) return;
    const timer = setInterval(() => {
      try {
        const payload = {
          examination,
          investigation,
          plan,
          medicines,
          advices,
          notes: formValues,
        };
        sessionStorage.setItem(`dcms.draft.doctor_visit_${visitId}`, JSON.stringify(payload));
      } catch (_e) { /* ignore */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [visitId, examination, investigation, plan, medicines, advices, formValues]);

  // Restore draft on mount if present
  useEffect(() => {
    if (!visitId) return;
    try {
      const saved = sessionStorage.getItem(`dcms.draft.doctor_visit_${visitId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.examination) setExamination(parsed.examination);
        if (parsed?.investigation) setInvestigation(parsed.investigation);
        if (parsed?.plan) setPlan(parsed.plan);
        if (parsed?.medicines?.length) setMedicines(parsed.medicines);
        if (parsed?.advices) setAdvices(parsed.advices);
        if (parsed?.notes) reset(parsed.notes);
      }
    } catch (_e) { /* ignore */ }
  }, [visitId]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    try {
      const v = await visitsApi.get(visitId);
      setVisit(v);
      const [h, em, im, mm, am, pm, dl] = await Promise.all([
        patientsApi.history(v.patientId),
        mastersApi.list('examination_master'),
        mastersApi.list('investigation_master'),
        mastersApi.list('medicine_master'),
        mastersApi.list('advice_master'),
        mastersApi.list('plan_master'),
        diseaseTemplatesApi.listDiseases(),
      ]);
      setHistory(h);
      setExamMaster(em);
      setInvestigationMaster(im);
      setMedicineMaster(mm);
      setAdviceMaster(am);
      setPlanMaster(pm);
      // Only diseases that actually have a template configured show up as
      // chips in the doctor form — hides empty ones from the picker.
      setDiseaseList((dl || []).filter((d) => d.isActive !== false && d.templateCount > 0));

      // Pick up IPD status so we can flag "already admitted".
      refreshIpdStatus(v.patientId);

      if (v.doctor) {
        reset({
          prescriptionNotes: v.doctor.prescription || '',
          followupNotes: v.followup?.notes || '',
        });
        try {
          const ex = JSON.parse(v.doctor.examination || '[]');
          setExamination(ex);
        } catch { /* ignore */ }
        try {
          const inv = JSON.parse(v.doctor.investigation || '[]');
          setInvestigation(inv);
        } catch { /* ignore */ }
        // Plan stored as JSON array of labels (same shape as examination/investigation).
        // If a legacy free-text value exists, fall back to a single-item array.
        const rawPlan = v.doctor.plan || '';
        try {
          const parsed = JSON.parse(rawPlan);
          setPlan(Array.isArray(parsed) ? parsed : [rawPlan].filter(Boolean));
        } catch {
          setPlan(rawPlan ? [rawPlan] : []);
        }
      }
      // Prefill medicine rows. Always pad up to a minimum of 5 visible rows.
      if (v.medicines?.length) {
        const rows = v.medicines.map((mi) => ({
          _rowId: nextRowId(),
          option: mi.medicineId ? (mm.find((m) => m.id === mi.medicineId) || { name: mi.medicineName }) : null,
          medicineName: mi.medicineName || '',
          dosage: mi.dosage || '',
          intake: mi.intake || 'After Food',
          days: mi.days != null ? String(mi.days) : '',
          qty:  mi.qty  != null ? String(mi.qty)  : '',
          remarks: mi.remarks || '',
          qtyEdited: true,    // existing rows: trust stored qty, don't auto-overwrite
        }));
        while (rows.length < 5) rows.push(blankMed());
        setMedicines(rows);
      }
      if (v.advices?.length) {
        setAdvices(v.advices.map((a) =>
          a.adviceId
            ? am.find((m) => m.id === a.adviceId) || { text: a.text }
            : { text: a.customText }
        ));
      }
      if (v.followup?.followupDate) {
        setFollowupDate(dayjs(v.followup.followupDate));
        // A previously-saved follow-up is treated as the doctor's explicit
        // choice — disable the auto recompute so we don't clobber it.
        setFollowupAuto(false);
      }
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load visit', 'error');
    }
  };

  useEffect(() => { load(); }, [visitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // While the doctor hasn't manually picked a follow-up date, keep the
  // picker in sync with the longest medicine course.
  useEffect(() => {
    if (!followupAuto) return;
    const next = computeAutoFollowup(medicines);
    setFollowupDate(next);
  }, [medicines, followupAuto]);

  const print = async () => {
    const r = await fetch(printApi.prescriptionUrl(visitId), { headers: authHeader() });
    if (!r.ok) { notify('Failed to load PDF', 'error'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  // Toggle a disease's medicine template on/off.
  //   - First click  → fetch the template and append tagged rows to the Rx.
  //   - Second click → drop every row that came from that disease.
  // Each template row is tagged with `templateDiseaseId` so we know which
  // ones to pull when the chip is deselected. Doctor-added rows never get
  // that tag, so they're safe from removal.
  const toggleDiseaseTemplate = async (disease) => {
    const isApplied = appliedDiseaseIds.includes(disease.id);
    if (isApplied) {
      setMedicines((curr) => {
        const kept = curr.filter((m) => m.templateDiseaseId !== disease.id);
        while (kept.length < 5) kept.push(blankMed());
        return kept;
      });
      setAppliedDiseaseIds((ids) => ids.filter((id) => id !== disease.id));
      notify(`Removed ${disease.name} template from Rx`, 'info');
      return;
    }

    try {
      const items = await diseaseTemplatesApi.get(disease.id);
      if (!items.length) return notify(`No template configured for ${disease.name}`, 'info');

      setMedicines((curr) => {
        const existingNames = new Set(
          curr
            .map((m) => (m.option?.name || m.medicineName || '').trim().toLowerCase())
            .filter(Boolean)
        );
        const newRows = items
          .filter((m) => !existingNames.has((m.medicineName || '').trim().toLowerCase()))
          .map((m) => ({
            _rowId: nextRowId(),
            option: m.medicineId ? (medicineMaster.find((x) => x.id === m.medicineId) || { name: m.medicineName }) : null,
            medicineName: m.medicineName || '',
            dosage: m.dosage || '',
            intake: m.intake || 'After Food',
            days: m.days != null ? String(m.days) : '',
            qty:  m.qty  != null ? String(m.qty)  : '',
            remarks: m.remarks || '',
            qtyEdited: true,
            templateDiseaseId: disease.id,
          }));

        // Strip trailing blank rows so template rows land immediately after
        // whatever the doctor has typed so far, then re-pad.
        const cleaned = curr.filter((m) => (m.option?.name || m.medicineName || '').trim());
        const merged = [...cleaned, ...newRows];
        while (merged.length < 5) merged.push(blankMed());
        return merged;
      });

      setAppliedDiseaseIds((ids) => (ids.includes(disease.id) ? ids : [...ids, disease.id]));
      notify(`Added ${items.length} medicines from ${disease.name} template`, 'success');
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load template', 'error');
    }
  };

  // ── Admit patient (IPD) ────────────────────────────────────
  const [admitOpen, setAdmitOpen] = useState(false);
  const [admitDx, setAdmitDx] = useState('');
  const [admitting, setAdmitting] = useState(false);
  // Live IPD status for this patient — either the current ADMITTED record
  // or the last REQUESTED record if reception hasn't picked a bed yet.
  const [ipdStatus, setIpdStatus] = useState(null);
  const refreshIpdStatus = async (patientId) => {
    if (!patientId) return;
    try {
      const [adm, req] = await Promise.all([
        ipdApi.admissions.list({ patientId, status: 'ADMITTED' }),
        ipdApi.admissions.list({ patientId, status: 'REQUESTED' }),
      ]);
      if (adm[0])      setIpdStatus({ kind: 'ADMITTED',  admission: adm[0] });
      else if (req[0]) setIpdStatus({ kind: 'REQUESTED', admission: req[0] });
      else             setIpdStatus(null);
    } catch { /* silent — button just stays enabled */ }
  };
  const requestAdmission = async () => {
    if (!visit) return;
    setAdmitting(true);
    try {
      const a = await ipdApi.admissions.request({
        patientId: visit.patientId,
        sourceVisitId: Number(visitId),
        admissionDiagnosis: admitDx.trim(),
      });
      notify(
        `Admission #${a.admissionNumber} sent to reception — patient can now be assigned a room.`,
        'success'
      );
      setAdmitOpen(false);
      setAdmitDx('');
      refreshIpdStatus(visit.patientId);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to request admission', 'error');
    } finally {
      setAdmitting(false);
    }
  };

  // Partial save — used after Examination + Investigation so the patient
  // can leave for tests and come back. Keeps status as WAITING_FOR_DOCTOR.
  const [savingPartial, setSavingPartial] = useState(false);
  const savePartial = async () => {
    setSavingPartial(true);
    try {
      await doctorApi.save(visitId, {
        partial: true,
        examination,
        investigation,
      });
      notify('Examination & Investigation saved. Visit still open.', 'success');
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSavingPartial(false);
    }
  };

  const onSubmit = async (form) => {
    setSubmitting(true);
    try {
      const medicinesPayload = medicines
        .map((m) => ({
          medicineId: m.option?.id || null,
          medicineName: (m.option?.name || m.medicineName || '').trim(),
          dosage: m.dosage,
          intake: m.intake,
          days:   m.days,
          qty:    m.qty,
          remarks: m.remarks,
        }))
        .filter((m) => m.medicineName);

      await doctorApi.save(visitId, {
        examination,
        investigation,
        medicines: medicinesPayload,
        prescription: form.prescriptionNotes,
        plan,
        advices: advices.map((a) => (a.id ? { adviceId: a.id } : { customText: a.text })),
        followupDate: followupDate ? followupDate.format('YYYY-MM-DD') : null,
        followupNotes: form.followupNotes || null,
      });
      notify('Saved. Visit marked complete.', 'success');
      navigate('/doctor');
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- medicine row helpers ----
  const updateMed = (idx, patch) => {
    setMedicines((curr) => curr.map((m, i) => {
      if (i !== idx) return m;
      const next = { ...m, ...patch };
      // Auto-fill qty when dosage or days change, unless the doctor has
      // manually overridden the quantity for this row.
      if (('dosage' in patch || 'days' in patch) && !next.qtyEdited) {
        const auto = calcQty(next.dosage, next.days);
        next.qty = auto === '' ? '' : String(auto);
      }
      return next;
    }));
  };
  const addMedRow = () => setMedicines((curr) => [...curr, blankMed()]);
  const removeMedRow = (idx) => setMedicines((curr) => {
    const next = curr.filter((_, i) => i !== idx);
    while (next.length < 5) next.push(blankMed());   // keep min 5 visible
    return next;
  });

  const previousVisits = useMemo(
    () => (history?.visits || []).filter((v) => v.id !== Number(visitId)),
    [history, visitId]
  );

  if (!visit) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  const name = [visit.firstName, visit.middleName, visit.surname].filter(Boolean).join(' ');
  const mo = visit.medicalOfficer;
  const knownNames = (visit.knownDiseases || []).map((d) => d.name || d.customName).filter(Boolean);

  return (
    <Box>
      {/* Patient + MO summary */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6">{name}</Typography>
              <Box sx={{ mt: 1 }}>
                <Chip size="small" label={`Case #${visit.caseNumber}`} sx={{ mr: 1 }} />
                <Chip size="small" label={visit.patientCode} sx={{ mr: 1 }} />
                <Chip size="small" color={visit.status === 'COMPLETED' ? 'success' : 'primary'} label={visit.status} />
              </Box>
            </Box>
            {visit.status === 'COMPLETED' && (
              <Button onClick={print} variant="outlined" startIcon={<PrintIcon />}>Print Prescription</Button>
            )}
          </Box>

          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <Typography variant="overline" color="text.secondary">Receptionist</Typography>
              <Stack spacing={0.3}>
                <Row label="Gender"   value={visit.gender} />
                <Row label="Mobile"   value={visit.mobile} />
                <Row label="Village"  value={visit.village} />
                <Row label="Address"  value={visit.address} />
                <Row label="Allergies" value={visit.allergies} />
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="overline" color="text.secondary">Medical Officer</Typography>
              <Stack spacing={0.3}>
                <Row label="Weight" value={mo?.weight ? `${mo.weight} kg` : null} />
                <Row label="Pulse"  value={mo?.pulse} />
                <Row label="BP"     value={(mo?.bpSystolic || mo?.bpDiastolic) ? `${mo.bpSystolic || '-'}/${mo.bpDiastolic || '-'}` : null} />
                <Row label="SpO2"   value={mo?.spo2 ? `${mo.spo2}%` : null} />
                <Row label="Complaints" value={mo?.complaints} />
                <Row label="Known"  value={knownNames.join(', ')} />
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Doctor form */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Typography variant="h6" sx={{ mb: 2 }}>Examination</Typography>
            <ToggleButtonGroup
              value={examination}
              onChange={(_, v) => setExamination(v)}
              sx={chipGroupSx}
            >
              {examMaster.map((e) => (
                <ToggleButton key={e.id} value={e.label} sx={chipSx}>
                  {e.label}
                </ToggleButton>
              ))}
              {examMaster.length === 0 && (
                <Typography color="text.secondary" variant="body2">
                  No examination items defined. Add some in Masters → Examination.
                </Typography>
              )}
            </ToggleButtonGroup>

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" sx={{ mb: 2 }}>Investigation</Typography>
            <ToggleButtonGroup
              value={investigation}
              onChange={(_, v) => setInvestigation(v)}
              sx={chipGroupSx}
            >
              {investigationMaster.map((i) => (
                <ToggleButton key={i.id} value={i.name} sx={chipSx}>
                  {i.name}
                </ToggleButton>
              ))}
              {investigationMaster.length === 0 && (
                <Typography color="text.secondary" variant="body2">
                  No investigation items defined. Add some in Masters → Investigation.
                </Typography>
              )}
            </ToggleButtonGroup>

            {/* Disease → Medicine templates */}
            {diseaseList.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                  <Typography variant="h6">Disease Template</Typography>
                  <Typography variant="caption" color="text.secondary">
                    (adds the pre-configured medicines to the Rx below — you can edit any of them)
                  </Typography>
                </Stack>
                <ToggleButtonGroup
                  value={appliedDiseaseIds}
                  onChange={() => { /* handled per-chip via onClick */ }}
                  sx={chipGroupSx}
                >
                  {diseaseList.map((d) => (
                    <ToggleButton
                      key={d.id}
                      value={d.id}
                      sx={chipSx}
                      onClick={(e) => { e.preventDefault(); toggleDiseaseTemplate(d); }}
                    >
                      {d.name}
                      {d.templateCount ? ` (${d.templateCount})` : ''}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
            )}

            {/* Partial save — patient goes off for reports and comes back. */}
            <Box sx={{ mt: 2.5, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                onClick={savePartial}
                variant="outlined"
                disabled={savingPartial || submitting}
                startIcon={savingPartial ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {savingPartial ? 'Saving…' : 'Save Examination & Investigation'}
              </Button>
            </Box>

            <Divider sx={{ my: 3 }} />

            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Typography variant="h6">Prescription (Rx)</Typography>
              <Button onClick={addMedRow} startIcon={<AddIcon />} size="small">
                Add medicine
              </Button>
            </Stack>

            {/* Column headers */}
            <Grid container spacing={1} sx={{
              px: 1, mb: 0.5, color: 'text.secondary',
              fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
              display: { xs: 'none', md: 'flex' },
            }}>
              <Grid item md={3}>MEDICINE</Grid>
              <Grid item md={1.7}>DOSAGE (M-A-E)</Grid>
              <Grid item md={1.7}>INTAKE</Grid>
              <Grid item md={1}>DAYS</Grid>
              <Grid item md={1}>QTY</Grid>
              <Grid item md={2.6}>REMARKS</Grid>
              <Grid item md={1}></Grid>
            </Grid>

            <Stack spacing={{ xs: 1.5, md: 1.25 }}>
              {medicines.map((m, idx) => {
                const isBlank = !m.option && !m.medicineName && !m.dosage && !m.days && !m.qty;
                return (
                  <Grid
                    container
                    spacing={1}
                    alignItems="center"
                    key={m._rowId || idx}
                    // On phones each medicine row gets its own subtle card so
                    // the wrapped fields (medicine / dosage / intake / days /
                    // qty / delete) read as a single grouped unit.
                    sx={{
                      p: { xs: 1.25, md: 0 },
                      border: { xs: '1px solid', md: 'none' },
                      borderColor: { xs: 'divider', md: 'transparent' },
                      borderRadius: { xs: 2, md: 0 },
                      bgcolor: { xs: 'background.paper', md: 'transparent' },
                    }}
                  >
                    <Grid item xs={12} md={3}>
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={medicineMaster}
                        value={m.option || m.medicineName || null}
                        onChange={(_, val) => {
                          if (val && typeof val === 'object') {
                            updateMed(idx, { option: val, medicineName: val.name });
                          } else if (typeof val === 'string') {
                            updateMed(idx, { option: null, medicineName: val });
                          } else {
                            updateMed(idx, { option: null, medicineName: '' });
                          }
                        }}
                        onInputChange={(_, val, reason) => {
                          if (reason === 'input' && !m.option) {
                            updateMed(idx, { medicineName: val });
                          }
                        }}
                        getOptionLabel={(o) => {
                          if (typeof o === 'string') return o;
                          if (!o) return '';
                          return o.form ? `${o.name} (${o.form})` : (o.name || '');
                        }}
                        isOptionEqualToValue={(o, v) => o?.id === v?.id}
                        renderInput={(p) => (
                          <TextField {...p} placeholder={`Medicine ${idx + 1}`} />
                        )}
                      />
                    </Grid>
                    <Grid item xs={6} md={1.7}>
                      <Autocomplete
                        freeSolo
                        size="small"
                        options={DOSAGE_OPTIONS}
                        value={m.dosage || ''}
                        onChange={(_, val) => updateMed(idx, { dosage: val || '' })}
                        onInputChange={(_, val, reason) => {
                          if (reason === 'input') updateMed(idx, { dosage: val });
                        }}
                        renderInput={(p) => (
                          <TextField {...p} placeholder="1-0-1" />
                        )}
                      />
                    </Grid>
                    <Grid item xs={6} md={1.7}>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={m.intake}
                        onChange={(e) => updateMed(idx, { intake: e.target.value })}
                      >
                        <MenuItem value="Before Food">Before Food</MenuItem>
                        <MenuItem value="After Food">After Food</MenuItem>
                        <MenuItem value="Before Breakfast">Before Breakfast</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={4} md={1}>
                      <TextField
                        size="small"
                        type="number"
                        placeholder="Days"
                        fullWidth
                        value={m.days}
                        onChange={(e) => updateMed(idx, { days: e.target.value })}
                        inputProps={{ min: 0 }}
                      />
                    </Grid>
                    <Grid item xs={4} md={1}>
                      <TextField
                        size="small"
                        type="number"
                        placeholder="Qty"
                        fullWidth
                        value={m.qty}
                        onChange={(e) =>
                          updateMed(idx, { qty: e.target.value, qtyEdited: true })
                        }
                        inputProps={{ min: 0 }}
                        title="Auto-filled from dosage × days. Override to set manually."
                      />
                    </Grid>
                    <Grid item xs={8} md={2.6}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Remarks"
                        value={m.remarks}
                        onChange={(e) => updateMed(idx, { remarks: e.target.value })}
                        inputProps={{ maxLength: 120 }}
                      />
                    </Grid>
                    <Grid item xs={4} md={1} sx={{ textAlign: { xs: 'right', md: 'center' } }}>
                      <IconButton
                        onClick={() => removeMedRow(idx)}
                        aria-label="Remove medicine row"
                        disabled={medicines.length <= 5 && isBlank}
                        size="small"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Grid>
                  </Grid>
                );
              })}
            </Stack>

            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              sx={{ mt: 2 }}
              label="Additional Notes / Instructions"
              placeholder="Anything extra you want printed under the Rx..."
              {...register('prescriptionNotes')}
            />

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" sx={{ mb: 1 }}>Advice</Typography>
            <Autocomplete
              multiple freeSolo
              options={adviceMaster}
              value={advices}
              onChange={(_, val) =>
                setAdvices(val.map((v) => (typeof v === 'string' ? { text: v } : v)))
              }
              getOptionLabel={(o) => (typeof o === 'string' ? o : o?.text || '')}
              isOptionEqualToValue={(o, v) => o?.id === v?.id || o?.text === v?.text}
              renderTags={(value, getTagProps) =>
                value.map((opt, idx) => (
                  <Chip variant="outlined" label={opt.text} {...getTagProps({ index: idx })} key={idx} />
                ))
              }
              renderInput={(p) => <TextField {...p} placeholder="Select or type custom advice..." />}
            />

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" sx={{ mb: 2 }}>Plan</Typography>
            <ToggleButtonGroup
              value={plan}
              onChange={(_, v) => setPlan(v)}
              sx={chipGroupSx}
            >
              {planMaster.map((p) => (
                <ToggleButton key={p.id} value={p.name} sx={chipSx}>
                  {p.name}
                </ToggleButton>
              ))}
              {planMaster.length === 0 && (
                <Typography color="text.secondary" variant="body2">
                  No plan items defined. Add some in Masters → Plan.
                </Typography>
              )}
            </ToggleButtonGroup>

            <Divider sx={{ my: 3 }} />

            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="h6">Follow Up</Typography>
              {!followupAuto && (
                <Button
                  size="small"
                  onClick={() => setFollowupAuto(true)}
                  sx={{ textTransform: 'none' }}
                >
                  Reset to auto
                </Button>
              )}
            </Stack>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <DatePicker
                  label="Follow-up Date"
                  value={followupDate}
                  onChange={(d) => { setFollowupDate(d); setFollowupAuto(false); }}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      helperText: followupAuto
                        ? (followupDate
                            ? 'Auto: 5 days before the longest course ends · Sundays skipped'
                            : 'Auto: set Days on any medicine to schedule a follow-up')
                        : 'Manual override — use "Reset to auto" to recompute',
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField label="Follow-up Notes" fullWidth {...register('followupNotes')} />
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2, mt: 3, flexWrap: 'wrap' }}>
              {ipdStatus?.kind === 'ADMITTED' && (
                <Chip
                  color="warning"
                  variant="filled"
                  label={
                    `Already admitted — ${ipdStatus.admission.wardName || 'ward'} ` +
                    `${ipdStatus.admission.bedNumber || ''} ` +
                    `(Adm #${ipdStatus.admission.admissionNumber})`
                  }
                  sx={{ fontWeight: 600 }}
                />
              )}
              {ipdStatus?.kind === 'REQUESTED' && (
                <Chip
                  color="info"
                  variant="outlined"
                  label={`Admission request pending with Reception (Adm #${ipdStatus.admission.admissionNumber})`}
                  sx={{ fontWeight: 600 }}
                />
              )}
              <Button onClick={() => navigate('/doctor')}>Cancel</Button>
              <Button
                type="button"
                variant="outlined"
                color="warning"
                disabled={submitting || admitting || !!ipdStatus}
                onClick={() => setAdmitOpen(true)}
                title={
                  ipdStatus?.kind === 'ADMITTED'
                    ? 'Patient is already admitted — discharge them first.'
                    : ipdStatus?.kind === 'REQUESTED'
                    ? 'An admission request is already pending with Reception.'
                    : ''
                }
              >
                {ipdStatus?.kind === 'ADMITTED' ? 'Already Admitted' : 'Admit Patient'}
              </Button>
              <Button type="submit" variant="contained" disabled={submitting}>
                {submitting ? <CircularProgress size={22} color="inherit" /> : 'Save & Complete'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>

      <Dialog open={admitOpen} onClose={() => setAdmitOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Admit patient to IPD</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This sends the patient to Reception for room assignment. Once Reception picks a
            bed, the admission moves to <b>ADMITTED</b> status.
          </Typography>
          <TextField
            fullWidth multiline minRows={2}
            label="Provisional diagnosis (optional)"
            placeholder="e.g. Acute exacerbation of COPD"
            value={admitDx}
            onChange={(e) => setAdmitDx(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setAdmitOpen(false)}>Cancel</Button>
          <Button
            variant="contained" color="warning"
            onClick={requestAdmission}
            disabled={admitting}
          >
            {admitting ? <CircularProgress size={18} color="inherit" /> : 'Send to Reception'}
          </Button>
        </DialogActions>
      </Dialog>


      {/* Visit history */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>Previous Visits ({previousVisits.length})</Typography>
          {previousVisits.length === 0 && (
            <Typography color="text.secondary">No previous visits.</Typography>
          )}
          {previousVisits.slice(0, 5).map((pv) => (
            <Box key={pv.id} sx={{ p: 1.5, mb: 1, border: '1px solid #eee', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
                <Chip size="small" label={`Case #${pv.caseNumber}`} />
                <Chip size="small" label={pv.status} color={pv.status === 'COMPLETED' ? 'success' : 'warning'} />
                <Typography variant="body2" color="text.secondary">
                  {new Date(pv.visitDate).toLocaleDateString('en-IN')}
                </Typography>
              </Box>
              {pv.complaints && <Row label="Complaints" value={pv.complaints} />}
              {pv.prescription && (
                <Box sx={{ mt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">Prescription</Typography>
                  <Box sx={{ whiteSpace: 'pre-wrap', mt: 0.3, p: 1, bgcolor: '#fafafa', borderRadius: 1 }}>
                    {pv.prescription}
                  </Box>
                </Box>
              )}
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  );
}
