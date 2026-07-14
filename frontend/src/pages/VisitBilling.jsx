import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell,
  TableBody, IconButton, Chip, CircularProgress, Grid, TextField, Autocomplete,
  Button, Stack, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
  InputAdornment, Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PrintIcon from '@mui/icons-material/Print';

import { visitsApi, billingApi, mastersApi, printApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { openPdf } from '../utils/openPdf.js';

const Row = ({ label, value }) => (
  <Box sx={{ display: 'flex', gap: 1 }}>
    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 500 }}>{value || '—'}</Typography>
  </Box>
);

const money = (n) => `₹ ${Number(n || 0).toFixed(2)}`;

// Service codes that represent the visit's consultation fee.
const CONSULTATION_CODES = new Set(['NEW_CASE', 'OLD_CASE']);

export default function VisitBilling() {
  const { visitId } = useParams();
  const navigate = useNavigate();
  const { notify } = useSnackbar();
  const { user } = useAuth();

  const [visit, setVisit] = useState(null);
  const [bill, setBill]   = useState({ items: [], total: 0 });
  const [serviceMaster, setServiceMaster] = useState([]);

  // Add-charge form (used only for non-consultation services).
  const [picked, setPicked]     = useState(null);
  const [price, setPrice]       = useState('');
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding]     = useState(false);

  // Consultation print dialog.
  const [printDlg, setPrintDlg] = useState({ open: false, amount: '' });

  const canEdit = ['ADMIN', 'RECEPTIONIST'].includes(user?.role);

  const reload = async () => {
    try {
      const [v, b] = await Promise.all([
        visitsApi.get(visitId),
        billingApi.list(visitId),
      ]);
      setVisit(v);
      setBill(b);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const s = await mastersApi.list('service_master');
        setServiceMaster(s);
      } catch (_e) {
        notify('Failed to load price master', 'error');
      }
    })();
    reload();
  }, [visitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a service is picked for the add-charge row, default its price.
  useEffect(() => {
    if (picked) setPrice(String(picked.price ?? ''));
  }, [picked]);

  // ---- Derive consultation vs other charges from the bill ----
  // (Backend stores the service code; we look it up via service_master.)
  const codeById = useMemo(() => {
    const m = new Map();
    serviceMaster.forEach((s) => m.set(s.id, s.code));
    return m;
  }, [serviceMaster]);

  const consultationLine = useMemo(() => {
    return bill.items.find((i) => CONSULTATION_CODES.has(codeById.get(i.serviceId)));
  }, [bill, codeById]);

  const otherCharges = useMemo(() => {
    return bill.items.filter((i) => !CONSULTATION_CODES.has(codeById.get(i.serviceId)));
  }, [bill, codeById]);

  // Non-consultation services available in the picker.
  const pickableServices = useMemo(
    () => serviceMaster.filter((s) => !CONSULTATION_CODES.has(s.code)),
    [serviceMaster]
  );

  const otherTotal = otherCharges.reduce(
    (s, i) => s + Number(i.price) * Number(i.quantity || 1), 0
  );
  const consultationTotal = consultationLine
    ? Number(consultationLine.price) * Number(consultationLine.quantity || 1)
    : 0;
  const grandTotal = otherTotal + consultationTotal;

  // ---- Actions ----
  const addCharge = async () => {
    if (!picked) { notify('Choose a service', 'warning'); return; }
    if (!price)  { notify('Enter a price', 'warning'); return; }
    setAdding(true);
    try {
      await billingApi.add(visitId, {
        serviceId: picked.id,
        serviceName: picked.name,
        price: Number(price),
        quantity: Number(quantity) || 1,
      });
      setPicked(null); setPrice(''); setQuantity(1);
      reload();
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to add', 'error');
    } finally {
      setAdding(false);
    }
  };

  const removeCharge = async (id) => {
    try {
      await billingApi.remove(id);
      reload();
    } catch (e) {
      if (e?.cancelled) return;
      notify(e?.response?.data?.message || 'Failed to remove', 'error');
    }
  };

  // Open the consultation print dialog with the *current* stored amount pre-filled.
  const openConsultationPrint = () => {
    setPrintDlg({
      open: true,
      amount: consultationLine ? String(consultationLine.price) : '',
    });
  };

  // Submit print: opens PDF in a new tab, then reloads (server has auto-reset
  // the stored consultation price back to the master default).
  const printConsultation = async () => {
    const amt = printDlg.amount;
    if (amt === '' || isNaN(Number(amt)) || Number(amt) < 0) {
      notify('Enter a valid amount', 'warning'); return;
    }
    try {
      await openPdf(printApi.consultationReceiptUrl(visitId, amt));
      setPrintDlg({ open: false, amount: '' });
      reload(); // shows the auto-reset price
      notify('Bill printed. Price reset to default.', 'success');
    } catch (e) {
      notify(e.message || 'Print failed', 'error');
    }
  };

  const printOtherCharges = async () => {
    if (otherCharges.length === 0) {
      notify('No other charges to print', 'info'); return;
    }
    try {
      await openPdf(printApi.chargesReceiptUrl(visitId));
    } catch (e) {
      notify(e.message || 'Print failed', 'error');
    }
  };

  if (!visit) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  const fullName = [visit.firstName, visit.middleName, visit.surname].filter(Boolean).join(' ');

  return (
    <Box>
      {/* ---- Patient header ---- */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h6">{fullName}</Typography>
              <Box sx={{ mt: 1 }}>
                <Chip size="small" label={`Case #${visit.caseNumber}`} sx={{ mr: 1 }} />
                <Chip size="small" label={visit.patientCode} sx={{ mr: 1 }} />
                <Chip
                  size="small"
                  color={visit.caseType === 'NEW' ? 'primary' : 'default'}
                  label={visit.caseType === 'NEW' ? 'New Case' : 'Old Case'}
                />
              </Box>
              <Box sx={{ mt: 2 }}>
                <Stack spacing={0.3}>
                  <Row label="Mobile"  value={visit.mobile} />
                  <Row label="Village" value={visit.village} />
                  <Row label="Date"    value={new Date(visit.visitDate).toLocaleDateString('en-IN')} />
                </Stack>
              </Box>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">GRAND TOTAL</Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                {money(grandTotal)}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* ---- BILL 1: Consultation ---- */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box>
              <Typography variant="h6">Consultation Bill</Typography>
              <Typography variant="body2" color="text.secondary">
                Auto-generated at registration. Edit the amount only when a patient asks for a bill —
                the stored price resets to default after printing.
              </Typography>
            </Box>
            {canEdit && (
              <Button
                variant="contained"
                startIcon={<PrintIcon />}
                onClick={openConsultationPrint}
                disabled={!consultationLine}
              >
                Print Bill
              </Button>
            )}
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Service</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {consultationLine ? (
                <TableRow>
                  <TableCell>{consultationLine.serviceName}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {money(consultationLine.price)}
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell colSpan={2}>
                    <Typography color="text.secondary">No consultation charge.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ---- BILL 2: Other charges ---- */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box>
              <Typography variant="h6">Other Charges</Typography>
              <Typography variant="body2" color="text.secondary">
                ECG, Injection, etc. Printed as a separate bill.
              </Typography>
            </Box>
            {canEdit && (
              <Button
                variant="outlined"
                startIcon={<PrintIcon />}
                onClick={printOtherCharges}
                disabled={otherCharges.length === 0}
              >
                Print Bill
              </Button>
            )}
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Service</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Subtotal</TableCell>
                {canEdit && <TableCell align="right">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {otherCharges.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 5 : 4}>
                    <Typography color="text.secondary">No other charges yet.</Typography>
                  </TableCell>
                </TableRow>
              )}
              {otherCharges.map((i) => (
                <TableRow key={i.id} hover>
                  <TableCell>{i.serviceName}</TableCell>
                  <TableCell align="right">{money(i.price)}</TableCell>
                  <TableCell align="right">{i.quantity}</TableCell>
                  <TableCell align="right">{money(Number(i.price) * Number(i.quantity))}</TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      <IconButton onClick={() => removeCharge(i.id)} size="small">
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {otherCharges.length > 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 3 : 2} align="right">
                    <Typography sx={{ fontWeight: 700 }}>TOTAL</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {money(otherTotal)}
                    </Typography>
                  </TableCell>
                  {canEdit && <TableCell />}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ---- Add charge form ---- */}
      {canEdit && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Add Service to Other Charges</Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={5}>
                <Autocomplete
                  options={pickableServices}
                  value={picked}
                  onChange={(_, v) => setPicked(v)}
                  getOptionLabel={(o) => o ? `${o.name}  (₹${o.price})` : ''}
                  isOptionEqualToValue={(o, v) => o?.id === v?.id}
                  renderInput={(p) => <TextField {...p} label="Service" placeholder="e.g. ECG, Injection..." />}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField label="Price (₹)" type="number" fullWidth value={price}
                  onChange={(e) => setPrice(e.target.value)} />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField label="Qty" type="number" fullWidth value={quantity}
                  onChange={(e) => setQuantity(e.target.value)} inputProps={{ min: 1 }} />
              </Grid>
              <Grid item xs={12} sm={2}>
                <Button
                  fullWidth variant="contained" startIcon={<AddIcon />}
                  onClick={addCharge} disabled={adding || !picked}
                >
                  {adding ? <CircularProgress size={20} color="inherit" /> : 'Add'}
                </Button>
              </Grid>
            </Grid>
            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary">
              Manage prices in <RouterLink to="/services">Services & Prices</RouterLink>.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Box>
        <Button onClick={() => navigate('/patients/search')}>Back to Search</Button>
        <Button onClick={() => navigate(`/patients/${visit.patientId}/history`)} sx={{ ml: 1 }}>
          Patient History
        </Button>
      </Box>

      {/* ---- Consultation print dialog ---- */}
      <Dialog
        open={printDlg.open}
        onClose={() => setPrintDlg({ open: false, amount: '' })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Print Consultation Bill</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Edit the amount only if the patient is requesting a custom bill.
            After printing, the stored price will reset back to the master default
            (New Case ₹ 400 / Old Case ₹ 200).
          </Alert>
          <TextField
            label="Amount on bill"
            type="number"
            fullWidth
            autoFocus
            value={printDlg.amount}
            onChange={(e) => setPrintDlg({ ...printDlg, amount: e.target.value })}
            InputProps={{
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
            }}
            inputProps={{ min: 0, step: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && printConsultation()}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPrintDlg({ open: false, amount: '' })}>Cancel</Button>
          <Button variant="contained" onClick={printConsultation} startIcon={<PrintIcon />}>
            Print
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
