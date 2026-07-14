/**
 * Discharge Queue — currently-admitted patients waiting for discharge.
 *
 * Flow the clinic uses:
 *   1. Doctor "Admits" from the visit page       → REQUESTED admission
 *   2. Reception assigns a bed in Pending Admissions → ADMITTED
 *      → shows up here.
 *   3. When it's time to send the patient home, reception clicks
 *      **Discharge → Doctor Queue** on their row. That:
 *        - Marks the admission DISCHARGED and frees the bed.
 *        - Creates a fresh WAITING_FOR_DOCTOR visit so the doctor sees the
 *          patient in the Doctor Queue for a discharge consultation.
 *        - Drops a 3C Register IPD entry.
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
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import dayjs from 'dayjs';

import { ipdApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const daysBetween = (from, to = new Date()) => {
  const ms = new Date(to) - new Date(from);
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
};

export default function DischargeQueue() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // Discharge confirmation dialog. Holds the admission we're about to send
  // to the Doctor Queue plus any notes the reception wants to attach.
  const [dialog, setDialog] = useState(null); // { admission, notes }
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
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

  const discharge = async () => {
    setSaving(true);
    try {
      const r = await ipdApi.admissions.discharge(dialog.admission.id, dialog.notes);
      // Backend now returns the follow-up visit alongside the admission —
      // surface the case # so reception knows exactly what to look for in
      // the Doctor Queue.
      const followupCase = r?.followupVisit?.caseNumber;
      notify(
        followupCase
          ? `${dialog.admission.patientName} discharged. Bed freed. Sent to Doctor Queue as Case #${followupCase}.`
          : `${dialog.admission.patientName} discharged. Bed freed.`,
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
          <Typography variant="h5">Discharge Queue</Typography>
          <Typography variant="body2" color="text.secondary">
            Currently-admitted patients. Click <b>Discharge → Doctor Queue</b> to send the
            patient to the doctor for a discharge consultation.
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
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
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
            <Chip size="small" label={`${filtered.length} of ${rows.length} in queue`} variant="outlined" />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : rows.length === 0 ? (
            <Alert severity="info">No admitted patients right now — nothing to discharge.</Alert>
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
                        <Button size="small" variant="contained" color="success"
                          startIcon={<LocalHospitalIcon />}
                          onClick={() => setDialog({ admission: r, notes: '' })}>
                          Discharge → Doctor Queue
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
        <DialogTitle>Discharge to Doctor Queue</DialogTitle>
        <DialogContent dividers>
          {dialog && (
            <Stack spacing={2}>
              <Alert severity="info">
                Discharging <strong>{dialog.admission.patientName}</strong> from bed
                <strong> {dialog.admission.bedNumber}</strong> ({dialog.admission.wardName}).
                <br />
                The bed will be freed and the patient will appear in the
                <b> Doctor Queue</b> as a fresh case for the discharge consultation.
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
          <Button variant="contained" color="success"
            startIcon={<ExitToAppIcon />}
            onClick={discharge} disabled={saving}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Confirm & Send to Doctor'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
