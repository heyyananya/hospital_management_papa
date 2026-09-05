/**
 * 3C Register IPD — manual ledger for admitted-and-discharged patients.
 *
 *   Reg. No.       — NN/MM-YY, sequence resets each calendar month.
 *   Receipt #      — sequence resets each Financial Year (Apr 1).
 *   Name / Age / Address (Village) / Diagnosis / DOA / DOD / Amount
 *
 * The letterhead (logo + clinic name + doctor name + signature) matches the
 * OPD register so both look like they belong to the same book.
 * Admin & Receptionist can add, edit and delete entries; every save persists
 * to the DB. The auto-allocated Reg. No. and Receipt # are frozen after
 * creation (they are the register's serial numbers).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Stack, Button, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, CircularProgress,
  Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert, Tooltip,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import SearchIcon from '@mui/icons-material/Search';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import { registersApi, settingsApi } from '../services/endpoints.js';
import { authHeader } from '../services/api.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { currentFY, prevFY } from '../utils/financialYear.js';

const fmtDate = (d) => (d ? dayjs(d).format('DD/MM/YY') : '');
const money = (n) => Number(n || 0).toFixed(2);
const isoDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : null);

const EMPTY_FORM = {
  id: null,
  patientName: '',
  age: '',
  village: '',
  diagnosis: '',
  doa: null,
  dod: null,
  amount: '',
  receiptNumber: '',
  fyKey: '',
};

export default function ThreeCRegisterIpd() {
  const today = dayjs();
  const fy = currentFY();
  const [fromDate, setFromDate] = useState(fy.start);
  const [toDate,   setToDate]   = useState(today.endOf('day'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({ clinic_name: 'FEFSA HOSPITAL', doctor_name: 'Dr. Ajit B. Patel' });
  const [form, setForm] = useState(null); // null = closed; object = open (add / edit)
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const { notify } = useSnackbar();

  useEffect(() => {
    settingsApi.get().then(setSettings).catch(() => null);
  }, []);

  const load = async () => {
    if (!fromDate || !toDate) return notify('Pick both dates', 'error');
    if (toDate.isBefore(fromDate)) return notify('"To" must be after "From"', 'error');
    setLoading(true);
    try {
      const r = await registersApi.ipd.list({
        fromDate: isoDate(fromDate),
        toDate:   isoDate(toDate),
      });
      setData(r);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load register', 'error');
    } finally {
      setLoading(false);
    }
  };
  // Load once on mount so the register is visible without pressing Show.
  useEffect(() => { load(); }, []); // eslint-disable-line

  const downloadPdf = async () => {
    const r = await fetch(registersApi.ipd.pdfUrl(isoDate(fromDate), isoDate(toDate)), {
      headers: authHeader(),
    });
    if (!r.ok) return notify('Failed to download PDF', 'error');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const openAdd = () => setForm({ ...EMPTY_FORM });
  const openEdit = (row) => setForm({
    id: row.id,
    patientName: row.patientName || '',
    age: row.age || '',
    village: row.village || '',
    diagnosis: row.diagnosis || '',
    doa: row.doa ? dayjs(row.doa) : null,
    dod: row.dod ? dayjs(row.dod) : null,
    amount: row.amount ?? '',
    receiptNumber: row.receiptNumber ?? '',
    fyKey: row.fyKey || '',
  });

  const saveForm = async () => {
    if (!form.patientName?.trim()) return notify('Patient name is required', 'error');
    if (form.amount !== '' && (!Number.isFinite(Number(form.amount)) || Number(form.amount) < 0)) {
      return notify('Amount must be a non-negative number', 'error');
    }
    setSaving(true);
    try {
      const payload = {
        patientName: form.patientName.trim(),
        age:         form.age === '' ? null : String(form.age).trim(),
        village:     form.village === '' ? null : form.village.trim(),
        diagnosis:   form.diagnosis === '' ? null : form.diagnosis.trim(),
        doa:         isoDate(form.doa),
        dod:         isoDate(form.dod),
        amount:      form.amount === '' ? 0 : Number(form.amount),
      };
      if (form.id) {
        // Receipt # is only sent on edit — the backend auto-allocates it on create.
        if (form.receiptNumber !== '' && form.receiptNumber != null) {
          const n = Number(form.receiptNumber);
          if (!Number.isInteger(n) || n < 1) {
            setSaving(false);
            return notify('Receipt # must be a positive whole number', 'error');
          }
          payload.receiptNumber = n;
        }
        await registersApi.ipd.update(form.id, payload);
        notify('Entry updated', 'success');
      } else {
        await registersApi.ipd.create(payload);
        notify('Entry added', 'success');
      }
      setForm(null);
      await load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    setSaving(true);
    try {
      await registersApi.ipd.remove(confirmDel.id);
      notify('Entry deleted', 'success');
      setConfirmDel(null);
      await load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Delete failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    if (!data) return { count: 0, amount: 0 };
    return data.summary || { count: data.rows?.length || 0, amount: 0 };
  }, [data]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">3C Register IPD</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
          Add Entry
        </Button>
      </Stack>

      {/* Filter bar */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <DatePicker
              label="From"
              value={fromDate}
              onChange={setFromDate}
              format="DD/MM/YYYY"
              slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
            />
            <DatePicker
              label="To"
              value={toDate}
              onChange={setToDate}
              format="DD/MM/YYYY"
              minDate={fromDate || undefined}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
            />
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Chip size="small" variant="outlined" sx={{ borderRadius: 999 }}
                label={`This FY (${currentFY().label.replace('FY ', '')})`}
                onClick={() => {
                  const f = currentFY();
                  setFromDate(f.start);
                  setToDate(dayjs().endOf('day').isBefore(f.end) ? dayjs().endOf('day') : f.end);
                }}
              />
              <Chip size="small" variant="outlined" sx={{ borderRadius: 999 }}
                label={`Last FY (${prevFY().label.replace('FY ', '')})`}
                onClick={() => {
                  const f = prevFY();
                  setFromDate(f.start);
                  setToDate(f.end);
                }}
              />
              <Chip size="small" variant="outlined" sx={{ borderRadius: 999 }}
                label="This month"
                onClick={() => { setFromDate(dayjs().startOf('month')); setToDate(dayjs().endOf('day')); }}
              />
            </Stack>
            <Button onClick={load} variant="contained" startIcon={<SearchIcon />}>Show</Button>
            <Button
              onClick={downloadPdf} variant="outlined" startIcon={<PictureAsPdfIcon />}
              disabled={!data}
            >
              Download PDF
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Register sheet with letterhead */}
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {/* Letterhead — matches 3C Register OPD */}
          <Stack direction="row" alignItems="center" spacing={2}
                 sx={{ pb: 2, borderBottom: '2px solid #0d527e' }}>
            <Box
              component="img"
              src={settingsApi.logoUrl()}
              alt="Logo"
              sx={{ height: 64, width: 64, objectFit: 'contain', borderRadius: 1, bgcolor: '#fff' }}
              onError={(e) => { e.target.src = '/logo.png'; }}
            />
            <Box sx={{ flex: 1, textAlign: 'center' }}>
              <Typography variant="h5"
                sx={{ fontWeight: 800, letterSpacing: 1, color: '#0d527e', textTransform: 'uppercase' }}>
                {settings.clinic_name || 'FEFSA HOSPITAL'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Chest Physician
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right', minWidth: 160 }}>
              <Typography sx={{ fontWeight: 700 }}>
                {settings.doctor_name || 'Dr. Ajit B. Patel'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                MB., DTCD. (Chest)
              </Typography>
            </Box>
          </Stack>

          {/* Title row */}
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 2, mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>3C Register IPD</Typography>
            <Typography variant="body2" color="text.secondary">
              {fmtDate(fromDate)} &nbsp; to &nbsp; {fmtDate(toDate)}
            </Typography>
          </Stack>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : !data ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              Pick a date range and press <strong>Show</strong> to load the register.
            </Box>
          ) : (
            <TableContainer sx={{ border: '1px solid #d9dde3', borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#eef2f8' }}>
                    <TableCell width={90}  align="center" sx={{ fontWeight: 700 }}>Reg. No.</TableCell>
                    <TableCell                             sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell width={60}  align="center" sx={{ fontWeight: 700 }}>Age</TableCell>
                    <TableCell width={140}                 sx={{ fontWeight: 700 }}>Address</TableCell>
                    <TableCell width={200}                 sx={{ fontWeight: 700 }}>Diagnosis</TableCell>
                    <TableCell width={90}  align="center" sx={{ fontWeight: 700 }}>DOA</TableCell>
                    <TableCell width={90}  align="center" sx={{ fontWeight: 700 }}>DOD</TableCell>
                    <TableCell width={100} align="right"  sx={{ fontWeight: 700 }}>Amount</TableCell>
                    <TableCell width={80}  align="center" sx={{ fontWeight: 700 }}>Receipt #</TableCell>
                    <TableCell width={90}  align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>{r.registrationNumber}</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{r.patientName}</TableCell>
                      <TableCell align="center">{r.age || '—'}</TableCell>
                      <TableCell>{r.village || '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'pre-wrap' }}>{r.diagnosis || '—'}</TableCell>
                      <TableCell align="center">{fmtDate(r.doa)}</TableCell>
                      <TableCell align="center">{fmtDate(r.dod)}</TableCell>
                      <TableCell align="right">{money(r.amount)}</TableCell>
                      <TableCell align="center">{r.receiptNumber}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(r)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setConfirmDel(r)} sx={{ color: 'error.main' }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        No entries in this range. Click <b>Add Entry</b> to create one.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.rows.length > 0 && (
                    <TableRow sx={{ bgcolor: '#f8fafd', '& td': { fontWeight: 700 } }}>
                      <TableCell colSpan={7} align="right">Total ({summary.count} entries)</TableCell>
                      <TableCell align="right">{money(summary.amount)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Signature */}
          <Box sx={{ mt: 6, textAlign: 'right', pr: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>
              {settings.doctor_name || 'Dr. Ajit B. Patel'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Chest Physician
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={!!form} onClose={() => (!saving && setForm(null))} maxWidth="sm" fullWidth>
        <DialogTitle>{form?.id ? 'Edit register entry' : 'Add register entry'}</DialogTitle>
        <DialogContent dividers>
          {form && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              {!form.id && (
                <Alert severity="info">
                  Registration No. and Receipt # are auto-assigned when you save.
                  Registration resets each month (e.g. <b>01/07-26</b>); Receipt # resets each Financial Year.
                </Alert>
              )}
              <TextField
                label="Patient name *" fullWidth autoFocus
                value={form.patientName}
                onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Age" fullWidth
                  value={form.age}
                  onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                />
                <TextField
                  label="Address (Village)" fullWidth
                  value={form.village}
                  onChange={(e) => setForm((f) => ({ ...f, village: e.target.value }))}
                />
              </Stack>
              <TextField
                label="Diagnosis" fullWidth multiline minRows={2}
                value={form.diagnosis}
                onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <DatePicker
                  label="DOA (Admission)"
                  value={form.doa}
                  onChange={(v) => setForm((f) => ({ ...f, doa: v }))}
                  format="DD/MM/YYYY"
                  slotProps={{ textField: { fullWidth: true } }}
                />
                <DatePicker
                  label="DOD (Discharge)"
                  value={form.dod}
                  onChange={(v) => setForm((f) => ({ ...f, dod: v }))}
                  minDate={form.doa || undefined}
                  format="DD/MM/YYYY"
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Amount (₹)" type="number" fullWidth
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  inputProps={{ min: 0, step: '0.01' }}
                />
                {form.id && (
                  <TextField
                    label="Receipt #" type="number" fullWidth
                    value={form.receiptNumber}
                    onChange={(e) => setForm((f) => ({ ...f, receiptNumber: e.target.value }))}
                    inputProps={{ min: 1, step: 1 }}
                    helperText={
                      form.fyKey
                        ? `Must be unique within FY ${form.fyKey}`
                        : 'Must be unique within the Financial Year'
                    }
                  />
                )}
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={saveForm} disabled={saving}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDel} onClose={() => (!saving && setConfirmDel(null))} maxWidth="xs" fullWidth>
        <DialogTitle>Delete entry</DialogTitle>
        <DialogContent dividers>
          {confirmDel && (
            <Alert severity="warning">
              Delete <b>{confirmDel.registrationNumber}</b> — {confirmDel.patientName}?
              This cannot be undone.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDel(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" color="error" onClick={doDelete} disabled={saving}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
