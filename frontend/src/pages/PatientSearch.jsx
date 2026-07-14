import { useState } from 'react';
import {
  Box, Card, CardContent, TextField, Button, Grid, Typography, Table,
  TableHead, TableRow, TableCell, TableContainer, TableBody, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions, Stack, Alert, CircularProgress,
} from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import HowToRegIcon from '@mui/icons-material/HowToReg';

import { patientsApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import BillRateSelector from '../components/BillRateSelector.jsx';

export default function PatientSearch() {
  const [filters, setFilters] = useState({ mobile: '', name: '', patientCode: '' });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  // busyId: which row's Put-in-Queue click is mid-request. Also acts as a
  // per-row disable so the reception can't double-fire the same row while
  // the request is on the wire.
  const [busyId, setBusyId] = useState(null);
  // Duplicate-visit confirmation. Only shown when the backend refuses
  // because the same patient already has an open visit today.
  const [dupDialog, setDupDialog] = useState(null); // { patient, existingVisit }
  // Bill rate for the next Put-in-Queue click. Defaults to Old Case (this
  // page is the returning-patient flow); reception can flip to New Case
  // when the doctor wants a fresh consultation fee for a long-gap visit.
  const [billCaseType, setBillCaseType] = useState('OLD');
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

  // Single-click Put-in-Queue: takes the patient row and starts the Old Case
  // visit directly, no intermediate confirmation dialog. Duplicate-visit
  // guard still fires as a 409 → shows the dup dialog with an override.
  const putInQueue = async (p, { force = false } = {}) => {
    setBusyId(p.id);
    try {
      const r = await patientsApi.createOldCase(p.id, {}, { force, billCaseType });
      const rateLabel = billCaseType === 'NEW' ? 'New Case (₹400)' : 'Old Case (₹200)';
      notify(
        `Case #${r.visit.caseNumber} created — ${p.firstName} ${p.surname} is now in the MO queue. Billed as ${rateLabel}.`,
        'success'
      );
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
          patient: p,
          existingVisit: e.response.data.details.existingVisit,
        });
      } else {
        notify(e?.response?.data?.message || 'Failed to create visit', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const openExistingVisit = (existingVisit) => {
    setDupDialog(null);
    if (user?.role === 'RECEPTIONIST') {
      navigate(`/visits/${existingVisit.id}/billing`);
    } else if (existingVisit.status === 'WAITING_FOR_DOCTOR') {
      navigate('/doctor');
    } else {
      navigate('/mo');
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Patient Search</Typography>

      <BillRateSelector
        value={billCaseType}
        onChange={setBillCaseType}
        label="Put next patient in queue as"
        hint={
          <>Applies to the next <b>Put in Queue</b> click. Flip to <b>New Case</b>
          when a long-gap returning patient is effectively a fresh consult.</>
        }
        sx={{ mb: 2 }}
      />

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
                      {/* One click straight into the MO queue — the earlier
                          two-step Select→confirm dialog was slowing reception
                          down without adding safety (the 409 dup guard covers
                          the accidental-double-visit case). */}
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={busyId === p.id ? null : <HowToRegIcon />}
                        disabled={busyId === p.id}
                        onClick={() => putInQueue(p)}
                        sx={{ ml: 1 }}
                        title="Create today's visit and add to MO queue"
                      >
                        {busyId === p.id ? <CircularProgress size={16} color="inherit" /> : 'Put in Queue'}
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
            onClick={() => dupDialog && putInQueue(dupDialog.patient, { force: true })}
            color="warning"
            disabled={busyId === dupDialog?.patient?.id}
          >
            {busyId === dupDialog?.patient?.id ? <CircularProgress size={16} /> : 'Create another visit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
