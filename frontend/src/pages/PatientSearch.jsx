import { useState } from 'react';
import {
  Box, Card, CardContent, TextField, Button, Grid, Typography, Table,
  TableHead, TableRow, TableCell, TableContainer, TableBody, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, Stack, Alert, CircularProgress,
} from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';

import { patientsApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function PatientSearch() {
  const [filters, setFilters] = useState({ mobile: '', name: '', patientCode: '' });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dupDialog, setDupDialog] = useState(null); // { patient, existingVisit }
  const { notify } = useSnackbar();
  const { user } = useAuth();
  const navigate = useNavigate();

  const onChange = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));

  const search = async () => {
    if (!filters.mobile && !filters.name && !filters.patientCode) {
      notify('Enter mobile, name, or patient ID', 'warning');
      return;
    }
    setLoading(true);
    try {
      const rows = await patientsApi.search(filters);
      setResults(rows);
      if (rows.length === 0) notify('No matching patient found', 'info');
    } catch (e) {
      notify(e?.response?.data?.message || 'Search failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const startOldCase = async ({ force = false } = {}) => {
    // `disabled={busy}` on the button already prevents a second click while
    // the request is in flight — no extra short-circuit needed here.
    setBusy(true);
    try {
      const r = await patientsApi.createOldCase(selected.id, {}, { force });
      notify(
        `Case #${r.visit.caseNumber} created — ${selected.firstName} ${selected.surname} is now in the MO queue.`,
        'success'
      );
      setSelected(null);
      setDupDialog(null);
      // Reception → billing next; other roles → their queue.
      if (user?.role === 'RECEPTIONIST') {
        navigate(`/visits/${r.visit.id}/billing`);
      } else {
        navigate('/mo');
      }
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.details?.existingVisit) {
        setDupDialog({
          patient: selected,
          existingVisit: e.response.data.details.existingVisit,
        });
      } else {
        notify(e?.response?.data?.message || 'Failed to create visit', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const openExistingVisit = (existingVisit) => {
    setDupDialog(null);
    setSelected(null);
    if (user?.role === 'RECEPTIONIST') {
      navigate(`/visits/${existingVisit.id}/billing`);
    } else if (existingVisit.status === 'WAITING_FOR_DOCTOR') {
      navigate('/doctor');
    } else {
      navigate('/mo');
    }
  };

  const startNewCase = () => {
    setSelected(null);
    navigate('/patients/new');
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Patient Search</Typography>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField label="Mobile" name="mobile" fullWidth value={filters.mobile} onChange={onChange} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Name" name="name" fullWidth value={filters.name} onChange={onChange} />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField label="Patient ID" name="patientCode" fullWidth value={filters.patientCode} onChange={onChange} />
            </Grid>
            <Grid item xs={12} sm={1}>
              <Button variant="contained" fullWidth onClick={search} startIcon={<SearchIcon />} disabled={loading}>
                Go
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {results.length === 0 ? (
            <Typography color="text.secondary">Search to see results here.</Typography>
          ) : (
            <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Patient ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Village</TableCell>
                  <TableCell>Mobile</TableCell>
                  <TableCell>Last Visit</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell><Chip size="small" label={p.patientCode} /></TableCell>
                    <TableCell>
                      {[p.firstName, p.middleName, p.surname].filter(Boolean).join(' ')}
                    </TableCell>
                    <TableCell>{p.village}</TableCell>
                    <TableCell>{p.mobile}</TableCell>
                    <TableCell>{p.lastVisit ? new Date(p.lastVisit).toLocaleDateString('en-IN') : '—'}</TableCell>
                    <TableCell align="right">
                      <IconButton component={RouterLink} to={`/patients/${p.id}/history`} title="History">
                        <HistoryIcon />
                      </IconButton>
                      {/* All three roles can select a returning patient and put them into the queue. */}
                      <Button size="small" variant="outlined" onClick={() => setSelected(p)} sx={{ ml: 1 }}>
                        Select
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

      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Patient Found</DialogTitle>
        <DialogContent dividers>
          {selected && (
            <Stack spacing={1.2}>
              <Box><b>Patient ID:</b> {selected.patientCode}</Box>
              <Box><b>Name:</b> {[selected.firstName, selected.middleName, selected.surname].filter(Boolean).join(' ')}</Box>
              <Box><b>Village:</b> {selected.village}</Box>
              <Box><b>Mobile:</b> {selected.mobile}</Box>
              <Box><b>Last Visit:</b> {selected.lastVisit ? new Date(selected.lastVisit).toLocaleDateString('en-IN') : '—'}</Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={startNewCase} disabled={busy}>New Case</Button>
          <Button variant="contained" onClick={() => startOldCase()} disabled={busy}>
            {busy ? <CircularProgress size={18} color="inherit" /> : 'Old Case (New Visit)'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate-visit-today confirmation (same UX as the Register Patient page). */}
      <Dialog
        open={!!dupDialog}
        onClose={() => setDupDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Already in the queue today</DialogTitle>
        <DialogContent dividers>
          {dupDialog && (
            <Stack spacing={1.5}>
              <Alert severity="warning" sx={{ py: 0.5 }}>
                <b>{dupDialog.patient.firstName} {dupDialog.patient.surname}</b>
                {' '}already has an active visit today.
              </Alert>
              <Box>
                <Typography variant="caption" color="text.secondary">Case number</Typography>
                <Typography sx={{ fontWeight: 700 }}>
                  #{dupDialog.existingVisit.caseNumber}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Current status</Typography>
                <Typography sx={{ fontWeight: 600 }}>
                  {String(dupDialog.existingVisit.status).replace(/_/g, ' ')}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Open the existing visit, or create a second one if the patient really needs another consultation today.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDupDialog(null)}>Cancel</Button>
          <Button
            onClick={() => openExistingVisit(dupDialog.existingVisit)}
            variant="contained"
          >
            Open existing
          </Button>
          <Button
            onClick={() => startOldCase({ force: true })}
            color="warning"
            disabled={busy}
          >
            {busy ? <CircularProgress size={16} /> : 'Create another visit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
