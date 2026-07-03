import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  Box, Card, CardContent, Grid, Typography, TextField, Button, Chip,
  CircularProgress, Autocomplete, Divider, Stack, IconButton, MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import { visitsApi, moApi, mastersApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const Row = ({ label, value }) => (
  <Box sx={{ display: 'flex', gap: 1 }}>
    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 500 }}>{value || '—'}</Typography>
  </Box>
);

// One blank complaint row (duration is split into a numeric value + a unit).
const blankComplaint = () => ({
  option: null,
  customName: '',
  durationValue: '',
  durationUnit: 'Days',
});

// Parse a saved duration string ("3 days", "2 months") back into the
// {value, unit} pair the form expects. Anything we can't parse is shown
// verbatim in the value field so no data is lost.
const parseDuration = (str) => {
  if (!str) return { durationValue: '', durationUnit: 'Days' };
  const m = String(str).trim().match(/^(\d+)\s*(month|months|mo|m|day|days|d)\b/i);
  if (m) {
    const unit = m[2].toLowerCase().startsWith('m') ? 'Months' : 'Days';
    return { durationValue: m[1], durationUnit: unit };
  }
  return { durationValue: String(str).trim(), durationUnit: 'Days' };
};

// Combine the form pair back into the string the backend stores.
const formatDuration = (value, unit) => {
  const v = String(value || '').trim();
  if (!v) return null;
  // If the user typed a non-numeric duration (legacy data), pass it through.
  if (!/^\d+$/.test(v)) return v;
  return `${v} ${unit}`;
};

// KCO chip label — prefer the short code; fall back to the name for
// custom free-typed entries that don't come from the master.
const kcoLabel = (o) => (o?.code ? o.code : (o?.name || ''));

export default function MOVisit() {
  const { visitId } = useParams();
  const navigate = useNavigate();
  const { notify } = useSnackbar();

  const [visit, setVisit] = useState(null);
  const [diseaseMaster, setDiseaseMaster] = useState([]);
  const [complaintMaster, setComplaintMaster] = useState([]);
  const [selectedDiseases, setSelectedDiseases] = useState([]);
  const [complaints, setComplaints] = useState([blankComplaint()]);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    (async () => {
      try {
        const [v, kd, cm] = await Promise.all([
          visitsApi.get(visitId),
          mastersApi.list('known_disease_master'),
          mastersApi.list('complaint_master'),
        ]);
        setVisit(v);
        setDiseaseMaster(kd);
        setComplaintMaster(cm);
        if (v.medicalOfficer) reset(v.medicalOfficer);
        if (v.knownDiseases?.length) {
          setSelectedDiseases(
            v.knownDiseases.map((d) =>
              d.diseaseId
                ? kd.find((m) => m.id === d.diseaseId) || { name: d.name }
                : { name: d.customName }
            )
          );
        }
        if (v.complaints?.length) {
          setComplaints(v.complaints.map((c) => {
            const { durationValue, durationUnit } = parseDuration(c.duration);
            return {
              option: c.complaintId
                ? cm.find((m) => m.id === c.complaintId) || { name: c.name }
                : null,
              customName: c.complaintId ? '' : (c.customName || ''),
              durationValue,
              durationUnit,
            };
          }));
        }
      } catch (e) {
        notify(e?.response?.data?.message || 'Failed to load visit', 'error');
      }
    })();
  }, [visitId, reset, notify]);

  const updateComplaint = (idx, patch) => {
    setComplaints((curr) => curr.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const addComplaint = () => setComplaints((curr) => [...curr, blankComplaint()]);
  const removeComplaint = (idx) =>
    setComplaints((curr) => (curr.length === 1 ? [blankComplaint()] : curr.filter((_, i) => i !== idx)));

  const onSubmit = async (form) => {
    setSubmitting(true);
    try {
      const knownDiseases = selectedDiseases.map((d) =>
        d.id ? { diseaseId: d.id } : { customName: d.name }
      );
      const complaintsPayload = complaints
        .map((c) => ({
          complaintId: c.option?.id || null,
          customName: c.option?.id ? null : (c.customName || '').trim() || null,
          duration: formatDuration(c.durationValue, c.durationUnit),
        }))
        .filter((c) => c.complaintId || c.customName);

      await moApi.save(visitId, {
        weight: form.weight || null,
        pulse: form.pulse || null,
        bpSystolic: form.bpSystolic || null,
        bpDiastolic: form.bpDiastolic || null,
        spo2: form.spo2 || null,
        complaints: complaintsPayload,
        knownDiseases,
      });
      notify('Saved. Visit sent to Doctor.', 'success');
      navigate('/mo');
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visit) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  const name = [visit.firstName, visit.middleName, visit.surname].filter(Boolean).join(' ');

  return (
    <Box>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6">{name}</Typography>
              <Box sx={{ mt: 1 }}>
                <Chip size="small" label={`Case #${visit.caseNumber}`} sx={{ mr: 1 }} />
                <Chip size="small" label={visit.patientCode} sx={{ mr: 1 }} />
                <Chip size="small" color="warning" label={visit.status} />
              </Box>
              <Box sx={{ mt: 2 }}>
                <Stack spacing={0.3}>
                  <Row label="Gender"   value={visit.gender} />
                  <Row label="Mobile"   value={visit.mobile} />
                  <Row label="Village"  value={visit.village} />
                  <Row label="Address"  value={visit.address} />
                </Stack>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="overline" color="text.secondary">From Receptionist</Typography>
              <Stack spacing={0.3}>
                <Row label="Reg by"   value={visit.createdByName} />
                <Row label="Date"     value={new Date(visit.visitDate).toLocaleDateString('en-IN')} />
                <Row label="Time"     value={visit.visitTime} />
                <Row label="Allergies" value={visit.allergies} />
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            {/* ----- Known Case Of (KCO) — pinned ABOVE vitals -----
                Chips show the short code (e.g. "DM", "HT") so the
                consultant scans a row at a glance; the dropdown still
                spells the disease out for unambiguous selection. */}
            <Typography variant="h6" sx={{ mb: 1 }}>Known Case Of (KCO)</Typography>
            <Autocomplete
              multiple
              freeSolo
              options={diseaseMaster}
              value={selectedDiseases}
              onChange={(_, val) =>
                setSelectedDiseases(val.map((v) => (typeof v === 'string' ? { name: v } : v)))
              }
              getOptionLabel={(o) => {
                if (typeof o === 'string') return o;
                if (!o) return '';
                if (o.code && o.name) return `${o.code} — ${o.name}`;
                return o.name || o.code || '';
              }}
              isOptionEqualToValue={(o, v) => o?.id === v?.id || o?.name === v?.name}
              renderTags={(value, getTagProps) =>
                value.map((opt, idx) => (
                  <Chip
                    variant="outlined"
                    label={kcoLabel(opt)}
                    title={opt?.name || ''}
                    {...getTagProps({ index: idx })}
                    key={idx}
                  />
                ))
              }
              renderInput={(p) => <TextField {...p} placeholder="Select or type custom KCO..." />}
            />

            <Divider sx={{ my: 3 }} />

            {/* ----- Vitals — all five fields in a single row on sm+ ----- */}
            <Typography variant="h6" sx={{ mb: 2 }}>Vitals</Typography>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ '& > *': { flex: 1, minWidth: 0 } }}
            >
              <TextField label="Weight (kg)"  type="number" fullWidth {...register('weight')} />
              <TextField label="Pulse"        type="number" fullWidth {...register('pulse')} />
              <TextField label="BP Systolic"  type="number" fullWidth {...register('bpSystolic')} />
              <TextField label="BP Diastolic" type="number" fullWidth {...register('bpDiastolic')} />
              <TextField label="SpO2 (%)"     type="number" fullWidth {...register('spo2')} />
            </Stack>

            <Divider sx={{ my: 3 }} />

            {/* ----- Complaints (paired: complaint + duration, with +Add) ----- */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="h6">Complaints</Typography>
              <Button onClick={addComplaint} startIcon={<AddIcon />} size="small">Add</Button>
            </Stack>

            <Stack spacing={1.5}>
              {complaints.map((c, idx) => {
                const blank = !c.option && !c.customName && !c.durationValue;
                return (
                  <Grid container spacing={1.5} alignItems="center" key={idx}>
                    <Grid item xs={12} sm={5}>
                      <Autocomplete
                        freeSolo
                        options={complaintMaster}
                        value={c.option || c.customName || null}
                        onChange={(_, val) => {
                          if (val && typeof val === 'object') {
                            updateComplaint(idx, { option: val, customName: '' });
                          } else if (typeof val === 'string') {
                            updateComplaint(idx, { option: null, customName: val });
                          } else {
                            updateComplaint(idx, { option: null, customName: '' });
                          }
                        }}
                        onInputChange={(_, val, reason) => {
                          if (reason === 'input' && !c.option) {
                            updateComplaint(idx, { customName: val });
                          }
                        }}
                        getOptionLabel={(o) => (typeof o === 'string' ? o : o?.name || '')}
                        isOptionEqualToValue={(o, v) => o?.id === v?.id}
                        renderInput={(p) => (
                          <TextField {...p} label={`Complaint ${idx + 1}`} placeholder="Select or type..." />
                        )}
                      />
                    </Grid>
                    <Grid item xs={5} sm={3}>
                      <TextField
                        label="Duration"
                        placeholder="e.g. 3"
                        type="number"
                        value={c.durationValue}
                        onChange={(e) => updateComplaint(idx, { durationValue: e.target.value })}
                        inputProps={{ min: 0 }}
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={5} sm={3}>
                      <TextField
                        label="Unit"
                        select
                        value={c.durationUnit}
                        onChange={(e) => updateComplaint(idx, { durationUnit: e.target.value })}
                        fullWidth
                      >
                        <MenuItem value="Days">Days</MenuItem>
                        <MenuItem value="Months">Months</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={2} sm={1}>
                      <IconButton
                        onClick={() => removeComplaint(idx)}
                        aria-label="Remove complaint"
                        disabled={complaints.length === 1 && blank}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                );
              })}
            </Stack>

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button onClick={() => navigate('/mo')}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={submitting}>
                {submitting ? <CircularProgress size={22} color="inherit" /> : 'Save & Send to Doctor'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
