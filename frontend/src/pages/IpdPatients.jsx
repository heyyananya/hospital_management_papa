/**
 * IPD Patients — currently-admitted list with days-in-stay + Discharge.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Stack, Button, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
  InputAdornment, IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import dayjs from 'dayjs';

import { ipdApi, billsApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const daysBetween = (from, to = new Date()) => {
  const ms = new Date(to) - new Date(from);
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
};

export default function IpdPatients() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null); // { admission, notes }
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState(null); // admission id currently being billed
  const [q, setQ] = useState('');
  const { notify } = useSnackbar();
  const navigate = useNavigate();

  // Client-side filter across name, patient ID, mobile, admission # and bed —
  // the admitted list is small enough that server-side search would be overkill.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = `${r.patientName || ''} ${r.patientCode || ''} ${r.mobile || ''} `
                + `${r.fyKey || ''}/${r.admissionNumber || ''} ${r.bedNumber || ''} `
                + `${r.wardName || ''}`;
      return hay.toLowerCase().includes(needle);
    });
  }, [rows, q]);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await ipdApi.admissions.list({ status: 'ADMITTED' }));
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

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

  const discharge = async () => {
    setSaving(true);
    try {
      await ipdApi.admissions.discharge(dialog.admission.id, dialog.notes);
      notify(
        `${dialog.admission.patientName} discharged. Bed freed. Added to 3C Register IPD — set the amount there.`,
        'success'
      );
      setDialog(null);
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Discharge failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">IPD Patients</Typography>
          <Typography variant="body2" color="text.secondary">
            Click <b>Make a Bill</b> on any row to create an <b>IPD bill</b> — services and charges are added manually on the bill page.
          </Typography>
        </Box>
        <Button onClick={load} startIcon={<RefreshIcon />} variant="outlined">Refresh</Button>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" useFlexGap>
            <TextField
              size="small"
              placeholder="Search name, patient ID, mobile, adm #, bed…"
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
              label={`${filtered.length} of ${rows.length} admitted`}
              variant="outlined"
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : rows.length === 0 ? (
            <Alert severity="info">No admitted patients right now.</Alert>
          ) : filtered.length === 0 ? (
            <Alert severity="info">No admitted patients match “{q}”.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Adm #</TableCell>
                    <TableCell>Patient ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Gender / Age</TableCell>
                    <TableCell>Ward / Bed</TableCell>
                    <TableCell>Doctor</TableCell>
                    <TableCell>Admitted</TableCell>
                    <TableCell>Days</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Chip size="small" color="warning" label={`${r.fyKey}/${r.admissionNumber}`} />
                      </TableCell>
                      <TableCell>{r.patientCode}</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{r.patientName}</TableCell>
                      <TableCell>{r.gender}{r.age ? ` / ${r.age}` : ''}</TableCell>
                      <TableCell>{r.wardName} — <b>{r.bedNumber}</b></TableCell>
                      <TableCell>{r.admittingDoctorName || '—'}</TableCell>
                      <TableCell>{dayjs(r.admittedAt).format('DD/MM/YY HH:mm')}</TableCell>
                      <TableCell>{daysBetween(r.admittedAt)}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button size="small" variant="outlined" startIcon={<AssignmentIcon />}
                            onClick={() => navigate(`/ipd/admissions/${r.id}/indoor-sheet`)}>
                            Indoor Sheet
                          </Button>
                          <Button size="small" variant="outlined" color="primary" startIcon={<ReceiptLongIcon />}
                            disabled={billing === r.id}
                            onClick={() => makeBill(r)}>
                            {billing === r.id ? 'Opening…' : 'Make a Bill'}
                          </Button>
                          <Button size="small" variant="contained" color="error" startIcon={<ExitToAppIcon />}
                            onClick={() => setDialog({ admission: r, notes: '' })}>
                            Discharge
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Discharge patient</DialogTitle>
        <DialogContent dividers>
          {dialog && (
            <Stack spacing={2}>
              <Alert severity="warning">
                Discharge <strong>{dialog.admission.patientName}</strong> from bed
                <strong> {dialog.admission.bedNumber}</strong> ({dialog.admission.wardName})?
                The bed will be marked FREE.
              </Alert>
              <TextField
                label="Discharge notes (optional)"
                fullWidth multiline minRows={2}
                value={dialog.notes}
                onChange={(e) => setDialog((d) => ({ ...d, notes: e.target.value }))}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={discharge} disabled={saving}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Confirm Discharge'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
