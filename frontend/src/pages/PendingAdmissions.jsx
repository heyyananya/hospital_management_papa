/**
 * Reception's Pending Admissions queue.
 * Shows every admission still in REQUESTED status. Reception picks a FREE
 * bed from a ward → assigns it → the admission jumps to ADMITTED and shows
 * up on the IPD Patients page.
 */
import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Stack, Button, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Alert,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import BedIcon from '@mui/icons-material/Bed';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import dayjs from 'dayjs';

import { ipdApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

export default function PendingAdmissions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);  // { admission, wardId, bedId }
  const [wards, setWards] = useState([]);
  const [freeBeds, setFreeBeds] = useState([]);
  const [saving, setSaving] = useState(false);
  const { notify } = useSnackbar();

  const load = async () => {
    setLoading(true);
    try {
      const [r, w] = await Promise.all([
        ipdApi.admissions.list({ status: 'REQUESTED' }),
        ipdApi.wards.list(),
      ]);
      setRows(r);
      setWards(w);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const openAssign = async (admission) => {
    setDialog({ admission, wardId: '', bedId: '' });
    setFreeBeds([]);
  };
  const pickWard = async (wardId) => {
    setDialog((d) => ({ ...d, wardId, bedId: '' }));
    try {
      const beds = await ipdApi.beds.list({ wardId, freeOnly: true });
      setFreeBeds(beds);
    } catch (e) {
      notify('Failed to load beds', 'error');
    }
  };

  const assign = async () => {
    if (!dialog?.bedId) return;
    setSaving(true);
    try {
      const a = await ipdApi.admissions.assignBed(dialog.admission.id, dialog.bedId);
      notify(
        `Assigned bed ${a.bedNumber} in ${a.wardName} — patient is now admitted.`,
        'success'
      );
      setDialog(null);
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to assign bed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (a) => {
    if (!window.confirm(`Cancel admission request for ${a.patientName}?`)) return;
    try {
      await ipdApi.admissions.cancel(a.id);
      notify('Admission cancelled', 'success');
      load();
    } catch (e) { notify(e?.response?.data?.message || 'Failed', 'error'); }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">Pending Admissions</Typography>
        <Button onClick={load} startIcon={<RefreshIcon />} variant="outlined">Refresh</Button>
      </Stack>
      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : rows.length === 0 ? (
            <Alert severity="info">No pending admissions right now.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Adm #</TableCell>
                    <TableCell>Requested at</TableCell>
                    <TableCell>Patient ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Gender / Age</TableCell>
                    <TableCell>Village</TableCell>
                    <TableCell>Diagnosis</TableCell>
                    <TableCell>By</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Chip size="small" color="warning" label={`${r.fyKey}/${r.admissionNumber}`} />
                      </TableCell>
                      <TableCell>{dayjs(r.createdAt).format('DD/MM/YY HH:mm')}</TableCell>
                      <TableCell>{r.patientCode}</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{r.patientName}</TableCell>
                      <TableCell>{r.gender}{r.age ? ` / ${r.age}` : ''}</TableCell>
                      <TableCell>{r.village}</TableCell>
                      <TableCell sx={{ maxWidth: 240, whiteSpace: 'pre-wrap' }}>
                        {r.admissionDiagnosis || '—'}
                      </TableCell>
                      <TableCell>{r.admittingDoctorName || '—'}</TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="contained" startIcon={<BedIcon />}
                          onClick={() => openAssign(r)} sx={{ mr: 1 }}>
                          Assign Room
                        </Button>
                        <Button size="small" color="inherit" startIcon={<CancelOutlinedIcon />}
                          onClick={() => cancel(r)}>
                          Cancel
                        </Button>
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
        <DialogTitle>Assign Room</DialogTitle>
        <DialogContent dividers>
          {dialog && (
            <Stack spacing={2}>
              <Alert severity="info">
                <strong>{dialog.admission.patientName}</strong> — Admission #{dialog.admission.admissionNumber}.
                Pick a ward, then choose a FREE bed to admit.
              </Alert>
              <TextField
                select label="Ward" fullWidth
                value={dialog.wardId}
                onChange={(e) => pickWard(Number(e.target.value))}
              >
                <MenuItem value="">(select ward)</MenuItem>
                {wards.map((w) => (
                  <MenuItem key={w.id} value={w.id} disabled={w.freeCount === 0}>
                    {w.name} — {w.freeCount}/{w.bedCount} free
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select label="Bed" fullWidth
                value={dialog.bedId}
                onChange={(e) => setDialog((d) => ({ ...d, bedId: Number(e.target.value) }))}
                disabled={!dialog.wardId}
              >
                {freeBeds.length === 0 ? (
                  <MenuItem value="">No free beds</MenuItem>
                ) : (
                  freeBeds.map((b) => (
                    <MenuItem key={b.id} value={b.id}>
                      {b.bedNumber} — {b.bedType.replace('_', ' ')}
                    </MenuItem>
                  ))
                )}
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={assign} disabled={!dialog?.bedId || saving}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Admit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
