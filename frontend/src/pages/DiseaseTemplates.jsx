/**
 * Admin: Disease → Medicine template editor.
 *
 * Every disease from known_disease_master is rendered as its own
 * accordion. Expand a disease to load and edit its 4–5 default medicines.
 * When a doctor picks the same disease during a visit, these rows are
 * appended to the patient's Rx and can be edited freely.
 */
import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Stack, Button, MenuItem,
  TextField, Grid, IconButton, Chip, CircularProgress, Autocomplete,
  Accordion, AccordionSummary, AccordionDetails, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VaccinesIcon from '@mui/icons-material/Vaccines';

import { diseaseTemplatesApi, mastersApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const blankRow = () => ({
  option: null,
  medicineName: '',
  dosage: '',
  intake: 'After Food',
  days: '',
  qty: '',
  remarks: '',
  qtyEdited: false,
});

// Same math the doctor form uses so the two stay perfectly in sync.
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

const calcQty = (dosage, days) => {
  const per = parseDose(dosage);
  const d = Number(days);
  if (per == null || !d || d <= 0) return '';
  const total = per * d;
  return Number.isInteger(total) ? total : Math.ceil(total);
};

const DOSAGE_OPTIONS = [
  '1-0-0', '0-1-0', '0-0-1',
  '1-0-1', '1-1-1', '1-1-0', '0-1-1',
  '2-0-2', '2-2-2',
  '1/2-0-1/2',
  'SOS',
];

/* ----------------------------------------------------------------------- */
/* Per-disease accordion — loads + saves its own template independently.   */
/* ----------------------------------------------------------------------- */

function DiseaseAccordion({ disease, medicineMaster, onCountChange }) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState([blankRow(), blankRow(), blankRow()]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState(disease.templateCount || 0);
  const { notify } = useSnackbar();

  const load = async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const items = await diseaseTemplatesApi.get(disease.id);
      const hydrated = items.map((m) => ({
        option: m.medicineId ? (medicineMaster.find((x) => x.id === m.medicineId) || { name: m.medicineName }) : null,
        medicineName: m.medicineName || '',
        dosage: m.dosage || '',
        intake: m.intake || 'After Food',
        days: m.days != null ? String(m.days) : '',
        qty:  m.qty  != null ? String(m.qty)  : '',
        remarks: m.remarks || '',
        qtyEdited: true, // existing rows: trust the stored qty
      }));
      while (hydrated.length < 3) hydrated.push(blankRow());
      setRows(hydrated);
      setLoaded(true);
    } catch (e) {
      notify(e?.response?.data?.message || `Failed to load ${disease.name}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) load();
  };

  const updateRow = (idx, patch) =>
    setRows((curr) => curr.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, ...patch };
      if (('dosage' in patch || 'days' in patch) && !next.qtyEdited) {
        const auto = calcQty(next.dosage, next.days);
        next.qty = auto === '' ? '' : String(auto);
      }
      return next;
    }));
  const addRow = () => setRows((curr) => [...curr, blankRow()]);
  const removeRow = (idx) => setRows((curr) => {
    const next = curr.filter((_, i) => i !== idx);
    return next.length ? next : [blankRow()];
  });

  const save = async () => {
    const items = rows
      .filter((r) => (r.option?.name || r.medicineName || '').trim())
      .map((r) => ({
        medicineId:   r.option?.id || null,
        medicineName: (r.option?.name || r.medicineName || '').trim(),
        dosage:  r.dosage,
        intake:  r.intake,
        days:    r.days,
        qty:     r.qty,
        remarks: r.remarks,
      }));
    setSaving(true);
    try {
      await diseaseTemplatesApi.replace(disease.id, items);
      setCount(items.length);
      onCountChange?.(disease.id, items.length);
      notify(`${disease.name} template saved (${items.length} medicine${items.length === 1 ? '' : 's'})`, 'success');
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Accordion
      expanded={expanded}
      onChange={toggle}
      disableGutters
      // unmountOnExit is the key to killing the initial-load lag on this
      // page: without it, every disease's Autocomplete + 3× (medicine
      // TextField + dosage + intake + days + qty + remarks) mounts on
      // first render, which for a masters list of 30+ diseases is ~600
      // MUI inputs at page-open time. With unmountOnExit the body is
      // only mounted while an accordion is actually open.
      TransitionProps={{ unmountOnExit: true, mountOnEnter: true }}
      sx={{
        mb: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '8px !important',
        '&:before': { display: 'none' },
        overflow: 'hidden',
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: '#f8fafd' }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
          <VaccinesIcon fontSize="small" sx={{ color: '#1a9162' }} />
          <Typography sx={{ fontWeight: 600 }}>
            {disease.code} — {disease.name}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Chip
            size="small"
            label={
              count === 0
                ? 'No template'
                : `${count} medicine${count === 1 ? '' : 's'} configured`
            }
            color={count > 0 ? 'success' : 'default'}
            variant={count > 0 ? 'filled' : 'outlined'}
            sx={{ fontWeight: 600 }}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
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
              {rows.map((m, idx) => (
                <Grid
                  container spacing={1} alignItems="center" key={idx}
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
                          updateRow(idx, { option: val, medicineName: val.name });
                        } else if (typeof val === 'string') {
                          updateRow(idx, { option: null, medicineName: val });
                        } else {
                          updateRow(idx, { option: null, medicineName: '' });
                        }
                      }}
                      onInputChange={(_, val, reason) => {
                        if (reason === 'input' && !m.option) {
                          updateRow(idx, { medicineName: val });
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
                      onChange={(_, val) => updateRow(idx, { dosage: val || '' })}
                      onInputChange={(_, val, reason) => {
                        if (reason === 'input') updateRow(idx, { dosage: val });
                      }}
                      renderInput={(p) => <TextField {...p} placeholder="1-0-1" />}
                    />
                  </Grid>
                  <Grid item xs={6} md={1.7}>
                    <TextField
                      select size="small" fullWidth
                      value={m.intake}
                      onChange={(e) => updateRow(idx, { intake: e.target.value })}
                    >
                      <MenuItem value="Before Food">Before Food</MenuItem>
                      <MenuItem value="After Food">After Food</MenuItem>
                      <MenuItem value="Before Breakfast">Before Breakfast</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={4} md={1}>
                    <TextField
                      size="small" type="number" placeholder="Days" fullWidth
                      value={m.days}
                      onChange={(e) => updateRow(idx, { days: e.target.value })}
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={4} md={1}>
                    <TextField
                      size="small" type="number" placeholder="Qty" fullWidth
                      value={m.qty}
                      onChange={(e) => updateRow(idx, { qty: e.target.value, qtyEdited: true })}
                      inputProps={{ min: 0 }}
                      title="Auto-filled from dosage × days. Override to set manually."
                    />
                  </Grid>
                  <Grid item xs={8} md={2.6}>
                    <TextField
                      size="small" fullWidth placeholder="Remarks / instructions"
                      value={m.remarks}
                      onChange={(e) => updateRow(idx, { remarks: e.target.value })}
                      inputProps={{ maxLength: 120 }}
                    />
                  </Grid>
                  <Grid item xs={4} md={1} sx={{ textAlign: { xs: 'right', md: 'center' } }}>
                    <IconButton onClick={() => removeRow(idx)} aria-label="Remove medicine row" size="small">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
              <Button onClick={addRow} startIcon={<AddIcon />} size="small">
                Add medicine
              </Button>
              <Button
                onClick={save}
                variant="contained"
                size="small"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Template'}
              </Button>
            </Stack>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

/* ----------------------------------------------------------------------- */
/* Page                                                                     */
/* ----------------------------------------------------------------------- */

export default function DiseaseTemplates() {
  const [diseases, setDiseases] = useState([]);
  const [medicineMaster, setMedicineMaster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const { notify } = useSnackbar();

  useEffect(() => {
    (async () => {
      try {
        const [ds, mm] = await Promise.all([
          diseaseTemplatesApi.listDiseases(),
          mastersApi.list('medicine_master'),
        ]);
        setDiseases(ds);
        setMedicineMaster(mm);
      } catch (e) {
        notify('Failed to load master data', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [notify]);

  const handleCountChange = (diseaseId, newCount) =>
    setDiseases((curr) =>
      curr.map((d) => (d.id === diseaseId ? { ...d, templateCount: newCount } : d))
    );

  const filtered = diseases.filter((d) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      (d.code || '').toLowerCase().includes(q) ||
      (d.name || '').toLowerCase().includes(q)
    );
  });

  const configuredCount = diseases.filter((d) => d.templateCount > 0).length;

  return (
    <Box>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h5">Disease Medicine Master</Typography>
        <Chip
          label={`${configuredCount} of ${diseases.length} configured`}
          size="small"
          color={configuredCount > 0 ? 'success' : 'default'}
          variant="outlined"
        />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Every disease from the master appears below. Expand any card to set the "usual"
        medicines for that disease — dosage, days, and qty will auto-fill. When the doctor
        picks the same disease during a visit, these rows are added to the Rx (editable + removable).
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Filter diseases by code or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </CardContent>
      </Card>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : diseases.length === 0 ? (
        <Alert severity="info">
          No diseases defined yet. Add some in <b>Masters → Known Case Of (KCO)</b> first.
        </Alert>
      ) : filtered.length === 0 ? (
        <Alert severity="info">No diseases match "{query}".</Alert>
      ) : (
        <Box>
          {filtered.map((d) => (
            <DiseaseAccordion
              key={d.id}
              disease={d}
              medicineMaster={medicineMaster}
              onCountChange={handleCountChange}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
