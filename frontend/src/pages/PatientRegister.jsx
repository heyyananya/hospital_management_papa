import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Card, CardContent, TextField, Button, Grid, Typography, MenuItem,
  CircularProgress, Autocomplete, ToggleButtonGroup, ToggleButton, Divider,
  Table, TableHead, TableRow, TableCell, TableContainer, TableBody, Chip, Stack,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import HowToRegIcon from '@mui/icons-material/HowToReg';

import { patientsApi, mastersApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import BillRateSelector from '../components/BillRateSelector.jsx';

const GENDERS = ['Male', 'Female', 'Other'];
const STATES  = ['Gujarat', 'Rajasthan', 'Other'];

export default function PatientRegister() {
  const navigate = useNavigate();
  const { notify } = useSnackbar();

  // Top-level case type toggle.
  const [caseType, setCaseType] = useState('NEW');

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Register Patient</Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2" color="text.secondary">Case Type:</Typography>
            <ToggleButtonGroup
              exclusive
              value={caseType}
              onChange={(_, v) => v && setCaseType(v)}
              size="small"
            >
              <ToggleButton value="NEW">New Case</ToggleButton>
              <ToggleButton value="OLD">Old Case (returning patient)</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </CardContent>
      </Card>

      {caseType === 'NEW'
        ? <NewCaseForm notify={notify} navigate={navigate} />
        : <OldCasePicker notify={notify} navigate={navigate} />
      }
    </Box>
  );
}

/* ----------------------------------------------------------------------- */
/* OLD CASE - search returning patient, then put them into the queue       */
/* ----------------------------------------------------------------------- */

function OldCasePicker({ notify, navigate }) {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ patientCode: '', name: '', mobile: '' });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  // Single busy id at a time — prevents accidental double-clicks across
  // different rows during the network round-trip.
  const [busyId, setBusyId] = useState(null);
  // Bill rate for the next Put-in-Queue click. Defaults to Old Case;
  // reception can flip to New Case for long-gap returning patients.
  const [billCaseType, setBillCaseType] = useState('OLD');
  // Last-created visit banner so the receptionist sees clear confirmation
  // and a jump-off link. Cleared whenever a new search starts.
  const [lastCreated, setLastCreated] = useState(null); // { visit, patient }
  // Duplicate-visit confirmation dialog. When the backend refuses because
  // the patient already has an active visit today, we show its details and
  // let the user open it or force-create a second visit.
  const [dupDialog, setDupDialog] = useState(null); // { patient, existingVisit }

  // Normalises a typed patient code to a plain integer string (1, 2, ...).
  // Accepts "2", "02", "000002", or even legacy "P2" / "P000002" - any
  // leading zeros and the legacy P prefix are stripped so it matches the DB.
  const normaliseCode = (raw) => {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';
    return String(parseInt(digits, 10));
  };

  const onChange = (e) => setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));

  /**
   * When the user enters a Patient ID and tabs/blurs/presses Enter,
   * we look up that exact patient and auto-fill Name + Mobile for them.
   */
  const lookupByCode = async () => {
    const code = normaliseCode(filters.patientCode);
    if (!code) return;
    setLoading(true);
    try {
      const rows = await patientsApi.search({ patientCode: code });
      setResults(rows);
      if (rows.length === 1) {
        const p = rows[0];
        const fullName = [p.firstName, p.middleName, p.surname].filter(Boolean).join(' ');
        setFilters((f) => ({
          ...f,
          patientCode: p.patientCode,
          name: fullName,
          mobile: p.mobile,
        }));
      } else if (rows.length === 0) {
        notify(`No patient found with ID ${code}`, 'info');
      }
    } catch (e) {
      notify(e?.response?.data?.message || 'Lookup failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  /** Generic search across any of the three fields. */
  const search = async () => {
    if (!filters.mobile && !filters.name && !filters.patientCode) {
      notify('Enter Patient ID, name, or mobile', 'warning');
      return;
    }
    setLoading(true);
    setLastCreated(null); // hide the "just added" banner once a new search starts
    try {
      const params = { ...filters };
      if (params.patientCode) params.patientCode = normaliseCode(params.patientCode);
      const rows = await patientsApi.search(params);
      setResults(rows);
      if (rows.length === 0) notify('No matching patient found', 'info');
    } catch (e) {
      notify(e?.response?.data?.message || 'Search failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Put the returning patient into the queue. Handles three cases:
   *   1. Success (201)  → banner + clear search so next patient can be added
   *   2. Already-in-queue (409) → open confirm dialog with the existing visit
   *   3. Any other error → snackbar with the server's message
   *
   * `force=true` re-runs the same request skipping the duplicate guard.
   */
  const putInQueue = async (p, { force = false } = {}) => {
    // Per-row `disabled` on the button already blocks re-clicks; we don't
    // need a global busyId short-circuit here (an earlier version had one
    // and it caused the first click to be swallowed in some cases).
    setBusyId(p.id);
    setDupDialog(null);
    try {
      const r = await patientsApi.createOldCase(p.id, {}, { force, billCaseType });
      setLastCreated({ visit: r.visit, patient: p });
      const rateLabel = billCaseType === 'NEW' ? 'New Case (₹400)' : 'Old Case (₹200)';
      notify(
        `Case #${r.visit.caseNumber} created — ${p.firstName} ${p.surname} is now in the MO queue. Billed as ${rateLabel}.`,
        'success'
      );
      // Clear the search so the receptionist can register the next patient.
      setResults([]);
      setFilters({ patientCode: '', name: '', mobile: '' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      // Duplicate — surface the existing visit and let the user decide.
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

  // "Open the existing visit" — route by role. Reception opens billing (their
  // next step); MO opens the MO queue; Admin/doctor jumps to the doctor queue
  // if the visit already left the MO stage.
  const openExistingVisit = (existingVisit) => {
    setDupDialog(null);
    if (user?.role === 'RECEPTIONIST') {
      navigate(`/visits/${existingVisit.id}/billing`);
    } else if (user?.role === 'MEDICAL_OFFICER') {
      navigate('/mo');
    } else if (existingVisit.status === 'WAITING_FOR_DOCTOR') {
      navigate('/doctor');
    } else {
      navigate('/mo');
    }
  };

  const clearBanner = () => setLastCreated(null);

  // Fields auto-fill once the Patient ID is looked up; until then they stay
  // read-only so the receptionist isn't tempted to type a wrong name.
  const autoFilled = results.length === 1 &&
                     normaliseCode(filters.patientCode) === results[0].patientCode;

  // Role-specific one-liner so each user knows exactly what "Put in Queue"
  // does from their seat.
  const roleHint = {
    RECEPTIONIST:    'creates today\'s visit, generates the bill, and places the patient in the MO queue.',
    MEDICAL_OFFICER: 'creates today\'s visit and places the patient in your MO queue.',
    ADMIN:           'creates today\'s visit and places the patient in the MO queue.',
  }[user?.role] || 'creates today\'s visit and places the patient in the MO queue.';

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Find returning patient
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Enter the Patient ID and press <b>Enter</b> (or Tab). The patient&apos;s name and
          mobile will be filled automatically. Clicking <b>Put in Queue</b> {roleHint}
        </Typography>

        <BillRateSelector
          value={billCaseType}
          onChange={setBillCaseType}
          label="Put in Queue as"
          hint={
            <>Flip to <b>New Case</b> when a long-gap returning patient should
            be treated as a fresh consultation.</>
          }
          sx={{ mb: 2 }}
        />

        {/* Just-added confirmation banner. Sticks around until the next search
            so the receptionist has a clear record of what they just did. */}
        {lastCreated && (
          <Alert
            severity="success" icon={<HowToRegIcon />} onClose={clearBanner}
            action={
              user?.role === 'RECEPTIONIST' ? (
                <Button color="inherit" size="small"
                  onClick={() => { clearBanner(); navigate(`/visits/${lastCreated.visit.id}/billing`); }}>
                  Open billing
                </Button>
              ) : user?.role === 'MEDICAL_OFFICER' ? (
                <Button color="inherit" size="small"
                  onClick={() => { clearBanner(); navigate('/mo'); }}>
                  Open MO queue
                </Button>
              ) : (
                <Button color="inherit" size="small"
                  onClick={() => { clearBanner(); navigate('/mo'); }}>
                  Open MO queue
                </Button>
              )
            }
            sx={{ mb: 2 }}
          >
            <b>{lastCreated.patient.firstName} {lastCreated.patient.surname}</b>{' '}
            placed in queue as{' '}
            <b>Case #{lastCreated.visit.caseNumber}</b>.
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}>
            <TextField
              label="Patient ID *"
              name="patientCode"
              fullWidth
              autoFocus
              value={filters.patientCode}
              onChange={onChange}
              onBlur={lookupByCode}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  lookupByCode();
                }
              }}
              placeholder="e.g. 2"
              helperText="Press Enter to auto-fill"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Name"
              name="name"
              fullWidth
              value={filters.name}
              onChange={onChange}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              InputProps={{ readOnly: autoFilled }}
              helperText={autoFilled ? 'Auto-filled from Patient ID' : 'Or search by name'}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Mobile"
              name="mobile"
              fullWidth
              value={filters.mobile}
              onChange={onChange}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              InputProps={{ readOnly: autoFilled }}
              helperText={autoFilled ? 'Auto-filled from Patient ID' : 'Or search by mobile'}
            />
          </Grid>
          <Grid item xs={12} sm={1}>
            <Button variant="contained" fullWidth onClick={search} startIcon={<SearchIcon />} disabled={loading}>
              Go
            </Button>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={26} />
          </Box>
        ) : results.length === 0 ? (
          <Typography color="text.secondary">No results yet — enter a Patient ID above.</Typography>
        ) : (
          <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Patient ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Age</TableCell>
                <TableCell>Gender</TableCell>
                <TableCell>Village</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>Last Visit</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell><Chip size="small" label={p.patientCode} /></TableCell>
                  <TableCell>
                    {[p.firstName, p.middleName, p.surname].filter(Boolean).join(' ')}
                  </TableCell>
                  <TableCell>{p.age ?? '—'}</TableCell>
                  <TableCell>{p.gender}</TableCell>
                  <TableCell>{p.village}</TableCell>
                  <TableCell>{p.mobile}</TableCell>
                  <TableCell>
                    {p.lastVisit ? new Date(p.lastVisit).toLocaleDateString('en-IN') : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small" variant="contained"
                      startIcon={busyId === p.id ? null : <HowToRegIcon />}
                      disabled={busyId === p.id}
                      onClick={() => putInQueue(p)}
                      title="Create today's visit and add to MO queue"
                    >
                      {busyId === p.id ? <CircularProgress size={18} color="inherit" /> : 'Put in Queue'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          
              </Table>
              </TableContainer>
        )}
      </CardContent>

      {/* Duplicate-visit confirmation. Shown when the backend refuses because
          the same patient already has an open visit today. */}
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
            onClick={() => putInQueue(dupDialog.patient, { force: true })}
            color="warning"
            disabled={busyId === dupDialog?.patient?.id}
          >
            {busyId === dupDialog?.patient?.id ? <CircularProgress size={16} /> : 'Create another visit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

/* ----------------------------------------------------------------------- */
/* NEW CASE - full registration form                                       */
/* ----------------------------------------------------------------------- */

function NewCaseForm({ notify, navigate }) {
  const {
    register, handleSubmit, control, watch, reset, setValue,
    formState: { errors },
  } = useForm({
    defaultValues: { state: 'Gujarat' },
    // Focus the first invalid field on failed submit so the receptionist
    // sees where the problem is instead of scrolling.
    shouldFocusError: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [villages, setVillages] = useState([]);
  // Bill rate for this new-registration visit. Reception can flip to OLD
  // when the person is actually a returning patient (from the pre-migration
  // legacy system) but doesn't yet exist in the new database.
  const [billCaseType, setBillCaseType] = useState('NEW');
  // Bumped after a successful save to force-remount every field — this
  // clears MUI's internal Autocomplete input which reset() alone can't touch.
  const [formKey, setFormKey] = useState(0);
  const stateValue = watch('state');

  // Load master data once for the dropdowns.
  useEffect(() => {
    (async () => {
      try {
        const v = await mastersApi.list('villages');
        setVillages(v);
      } catch (_e) {
        notify('Failed to load master data', 'error');
      }
    })();
  }, [notify]);

  const onSubmit = async (data) => {
    setSubmitting(true);
    try {
      const payload = {
        ...data,
        village: (data.village || '').toString().trim(),
        villageId: data.villageId || null,
        billCaseType,      // NEW = ₹400, OLD = ₹200 — see patientService
      };
      // When "Other" is selected, use the manually entered text as the state.
      if (data.state === 'Other') {
        payload.state = (data.stateOther || '').trim() || 'Other';
      }
      delete payload.stateOther;

      const r = await patientsApi.createNew(payload);
      const rateLabel = billCaseType === 'OLD' ? 'Old Case (₹200)' : 'New Case (₹400)';
      notify(
        `Patient ${r.patient.patientCode} registered, Case #${r.visit.caseNumber} — billed as ${rateLabel}.`,
        'success'
      );
      // Stay on the Register Patient page — clear every field for the next patient.
      reset({ state: 'Gujarat' });
      setBillCaseType('NEW');
      setFormKey((k) => k + 1);     // force-remount so MUI Autocomplete text clears too
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to register patient', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <form key={formKey} onSubmit={handleSubmit(onSubmit)} noValidate>
          <Grid container spacing={2}>

            <Grid item xs={12}>
              <BillRateSelector
                value={billCaseType}
                onChange={setBillCaseType}
                label="Bill this new patient as"
                hint={
                  <>Pick <b>Old Case</b> when the patient is actually a returning
                  patient (from the old system) but doesn't exist in the database
                  yet — the bill will be created at the ₹200 rate.</>
                }
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="overline" color="text.secondary">Demographics</Typography>
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                label="First Name *" fullWidth
                error={!!errors.firstName} helperText={errors.firstName?.message}
                {...register('firstName', { required: 'First name is required' })}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Middle Name" fullWidth {...register('middleName')} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Surname *" fullWidth
                error={!!errors.surname} helperText={errors.surname?.message}
                {...register('surname', { required: 'Surname is required' })}
              />
            </Grid>

            <Grid item xs={6} sm={3}>
              <Controller
                name="gender" control={control} defaultValue=""
                rules={{ required: 'Gender is required' }}
                render={({ field }) => (
                  <TextField select label="Gender *" fullWidth
                    error={!!errors.gender} helperText={errors.gender?.message} {...field}>
                    {GENDERS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                  </TextField>
                )}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                label="Age *" type="number" fullWidth inputProps={{ min: 0, max: 150 }}
                error={!!errors.age} helperText={errors.age?.message}
                {...register('age', {
                  required: 'Age is required',
                  min: { value: 0, message: 'Invalid age' },
                  max: { value: 150, message: 'Invalid age' },
                })}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label="Mobile *" fullWidth
                error={!!errors.mobile} helperText={errors.mobile?.message || '10-digit mobile'}
                {...register('mobile', {
                  required: 'Mobile is required',
                  pattern: { value: /^[6-9]\d{9}$/, message: 'Invalid mobile number' },
                })}
              />
            </Grid>

            <Grid item xs={12}>
              <Typography variant="overline" color="text.secondary">Location</Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <Controller
                name="village" control={control} defaultValue=""
                rules={{ required: 'Village is required' }}
                render={({ field }) => (
                  <Autocomplete
                    freeSolo
                    options={villages}
                    getOptionLabel={(o) => (typeof o === 'string' ? o : o?.name || '')}
                    isOptionEqualToValue={(o, v) => (o?.name || o) === (v?.name || v)}
                    // Form state is always a plain string — the picker just
                    // gives us a shortcut for setting Taluka/District/State
                    // (and remembering the master id).
                    value={field.value || ''}
                    onChange={(_, v) => {
                      if (v && typeof v === 'object') {
                        field.onChange(v.name || '');
                        setValue('villageId', v.id || '', { shouldValidate: false });
                        if (v.taluka)   setValue('taluka',   v.taluka,   { shouldValidate: true });
                        if (v.district) setValue('district', v.district, { shouldValidate: true });
                        if (v.state)    setValue('state',    v.state,    { shouldValidate: true });
                      } else {
                        field.onChange(v || '');
                        setValue('villageId', '', { shouldValidate: false });
                      }
                    }}
                    onInputChange={(_, v, reason) => {
                      // Only sync while the user is typing — not on 'reset'
                      // (which fires after selecting an option and would
                      // overwrite the object handling above).
                      if (reason === 'input') {
                        field.onChange(v || '');
                        setValue('villageId', '', { shouldValidate: false });
                      }
                    }}
                    renderInput={(p) => (
                      <TextField {...p} label="Village *"
                        error={!!errors.village} helperText={errors.village?.message} />
                    )}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Taluka *" fullWidth
                error={!!errors.taluka} helperText={errors.taluka?.message}
                {...register('taluka', { required: 'Taluka is required' })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="District *" fullWidth
                error={!!errors.district} helperText={errors.district?.message}
                {...register('district', { required: 'District is required' })}
              />
            </Grid>

            <Grid item xs={12} sm={stateValue === 'Other' ? 3 : 6}>
              <Controller
                name="state" control={control} defaultValue="Gujarat"
                rules={{ required: 'State is required' }}
                render={({ field }) => (
                  <TextField select label="State *" fullWidth
                    error={!!errors.state} helperText={errors.state?.message} {...field}>
                    {STATES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </TextField>
                )}
              />
            </Grid>
            {stateValue === 'Other' && (
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Specify State *" fullWidth
                  error={!!errors.stateOther} helperText={errors.stateOther?.message}
                  {...register('stateOther', { required: 'Please specify the state' })}
                />
              </Grid>
            )}

            <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
              <Button onClick={() => navigate('/patients/search')}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={submitting}>
                {submitting ? <CircularProgress size={22} color="inherit" /> : 'Save & Create Visit'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  );
}
