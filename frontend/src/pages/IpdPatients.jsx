/**
 * IPD Patients — currently-admitted list with days-in-stay + Discharge.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Stack, Button, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import AssignmentIcon from '@mui/icons-material/Assignment';
import dayjs from 'dayjs';

import { ipdApi } from '../services/endpoints.js';
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
  const { notify } = useSnackbar();
  const navigate = useNavigate();

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
        <Typography variant="h5">IPD Patients</Typography>
        <Button onClick={load} startIcon={<RefreshIcon />} variant="outlined">Refresh</Button>
      </Stack>
      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : rows.length === 0 ? (
            <Alert severity="info">No admitted patients right now.</Alert>
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
                  {rows.map((r) => (
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
