/**
 * IPD — Discharged Patients.
 *
 * Read-only history of patients who were admitted and later discharged.
 * Backed by GET /ipd/admissions?status=DISCHARGED. Includes a date-range
 * filter (against discharge date) and a text search across name, patient
 * code and admission number so the list stays usable as it grows.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Stack, Button, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Chip, CircularProgress,
  Alert, TextField, InputAdornment, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { DatePicker } from '@mui/x-date-pickers';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import { ipdApi, billsApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const fmtDT = (d) => (d ? dayjs(d).format('DD/MM/YY HH:mm') : '—');

// Whole-day count between admission and discharge, min 1 (a same-day
// admit-and-discharge still counts as one day of stay).
const stayDays = (from, to) => {
  if (!from || !to) return '—';
  const d = dayjs(to).startOf('day').diff(dayjs(from).startOf('day'), 'day');
  return Math.max(1, d);
};

export default function DischargedPatients() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState(dayjs().subtract(30, 'day').startOf('day'));
  const [toDate, setToDate] = useState(dayjs().endOf('day'));
  const [detail, setDetail] = useState(null);
  const [billing, setBilling] = useState(null); // admission id currently being billed
  const { notify } = useSnackbar();
  const navigate = useNavigate();

  const makeBill = async (admission) => {
    setBilling(admission.id);
    try {
      const b = await billsApi.createIpdFromAdmission(admission.id);
      navigate(`/bills/${b.id}`);
    } catch (e) {
      notify(e?.response?.data?.message || 'Could not create IPD bill', 'error');
    } finally {
      setBilling(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      setRows(await ipdApi.admissions.list({ status: 'DISCHARGED' }));
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  // Client-side filter: date range is inclusive on both ends.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fromDate && r.dischargedAt && dayjs(r.dischargedAt).isBefore(fromDate.startOf('day'))) return false;
      if (toDate   && r.dischargedAt && dayjs(r.dischargedAt).isAfter(toDate.endOf('day')))     return false;
      if (!needle) return true;
      const hay = `${r.patientName || ''} ${r.patientCode || ''} ${r.fyKey || ''}/${r.admissionNumber || ''} ${r.mobile || ''} ${r.bedNumber || ''} ${r.wardName || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, fromDate, toDate]);

  const totalStayDays = useMemo(
    () => filtered.reduce((s, r) => s + (Number.isFinite(stayDays(r.admittedAt, r.dischargedAt)) ? stayDays(r.admittedAt, r.dischargedAt) : 0), 0),
    [filtered]
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">Discharged Patients</Typography>
        <Button onClick={load} startIcon={<RefreshIcon />} variant="outlined">Refresh</Button>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <DatePicker
              label="Discharged from"
              value={fromDate}
              onChange={setFromDate}
              format="DD/MM/YYYY"
              slotProps={{ textField: { size: 'small', sx: { minWidth: 170 } } }}
            />
            <DatePicker
              label="Discharged to"
              value={toDate}
              onChange={setToDate}
              format="DD/MM/YYYY"
              minDate={fromDate || undefined}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 170 } } }}
            />
            <TextField
              size="small"
              placeholder="Search name, patient ID, adm #, mobile, bed…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              sx={{ flex: 1, minWidth: 260 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: q ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQ('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
            <Chip
              size="small"
              label={`${filtered.length} discharged • ${totalStayDays} total days`}
              color="default"
              variant="outlined"
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : filtered.length === 0 ? (
            <Alert severity="info">
              No discharged patients in this range.
            </Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Adm #</TableCell>
                    <TableCell>Patient ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Gender / Age</TableCell>
                    <TableCell>Mobile</TableCell>
                    <TableCell>Ward / Bed</TableCell>
                    <TableCell>Doctor</TableCell>
                    <TableCell>Admitted</TableCell>
                    <TableCell>Discharged</TableCell>
                    <TableCell align="right">Stay (days)</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Chip size="small" color="success" variant="outlined"
                              label={`${r.fyKey}/${r.admissionNumber}`} />
                      </TableCell>
                      <TableCell>{r.patientCode}</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{r.patientName}</TableCell>
                      <TableCell>{r.gender}{r.age ? ` / ${r.age}` : ''}</TableCell>
                      <TableCell>{r.mobile || '—'}</TableCell>
                      <TableCell>
                        {r.wardName ? <>{r.wardName} — <b>{r.bedNumber}</b></> : '—'}
                      </TableCell>
                      <TableCell>{r.admittingDoctorName || '—'}</TableCell>
                      <TableCell>{fmtDT(r.admittedAt)}</TableCell>
                      <TableCell>{fmtDT(r.dischargedAt)}</TableCell>
                      <TableCell align="right">{stayDays(r.admittedAt, r.dischargedAt)}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" title="Indoor sheet"
                          onClick={() => navigate(`/ipd/admissions/${r.id}/indoor-sheet`)}>
                          <AssignmentIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" title="Make a Bill" color="primary"
                          disabled={billing === r.id}
                          onClick={() => makeBill(r)}>
                          <ReceiptLongIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" title="Details" onClick={() => setDetail(r)}>
                          <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Details dialog — full admission record, incl. discharge notes & diagnosis */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {detail ? `${detail.patientName} — Adm ${detail.fyKey}/${detail.admissionNumber}` : ''}
        </DialogTitle>
        <DialogContent dividers>
          {detail && (
            <Stack spacing={1.5}>
              <Row k="Patient ID" v={detail.patientCode} />
              <Row k="Gender / Age" v={`${detail.gender || '—'}${detail.age ? ` / ${detail.age}` : ''}`} />
              <Row k="Mobile" v={detail.mobile || '—'} />
              <Row k="Village" v={detail.village || '—'} />
              <Row k="Source case #" v={detail.sourceCaseNumber || '—'} />
              <Row k="Ward / Bed" v={detail.wardName ? `${detail.wardName} — ${detail.bedNumber}` : '—'} />
              <Row k="Admitting doctor" v={detail.admittingDoctorName || '—'} />
              <Row k="Admission diagnosis" v={detail.admissionDiagnosis || '—'} multiline />
              <Row k="Admitted at" v={fmtDT(detail.admittedAt)} />
              <Row k="Discharged at" v={fmtDT(detail.dischargedAt)} />
              <Row k="Length of stay" v={`${stayDays(detail.admittedAt, detail.dischargedAt)} day(s)`} />
              <Row k="Discharge notes" v={detail.dischargeNotes || '—'} multiline />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetail(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Row({ k, v, multiline = false }) {
  return (
    <Stack direction={multiline ? 'column' : 'row'} spacing={multiline ? 0.25 : 2}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 150 }}>{k}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>{v}</Typography>
    </Stack>
  );
}
