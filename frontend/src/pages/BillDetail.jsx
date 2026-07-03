import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Card, CardContent, Grid, Typography, Chip, CircularProgress, Button,
  Table, TableHead, TableRow, TableCell, TableContainer, TableBody, IconButton, TextField,
  Stack, Divider, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Autocomplete, InputAdornment,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import LockIcon from '@mui/icons-material/Lock';
import EditIcon from '@mui/icons-material/EditNote';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';

import { billsApi, mastersApi, printApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { openPdf } from '../utils/openPdf.js';

const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

export default function BillDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useSnackbar();

  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit-mode state (only for Final bills not yet LOCKED).
  const [editing, setEditing] = useState(false);
  const [services, setServices] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [additional, setAdditional] = useState(0);
  const [notes, setNotes] = useState('');
  const [serviceMaster, setServiceMaster] = useState([]);
  const [picked, setPicked] = useState(null);
  const [pickedPrice, setPickedPrice] = useState('');
  const [pickedQty, setPickedQty] = useState(1);

  const [saving, setSaving] = useState(false);
  const [lockDlg, setLockDlg] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const b = await billsApi.get(id);
      setBill(b);
      setServices(b.services || []);
      setDiscount(Number(b.discount || 0));
      setAdditional(Number(b.additional || 0));
      setNotes(b.notes || '');
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mastersApi.list('service_master').then(setServiceMaster).catch(() => {});
  }, []);

  if (loading || !bill) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  const isAuto    = bill.billType === 'AUTO';
  const isFinal   = bill.billType === 'FINAL';
  const isLocked  = bill.status === 'LOCKED';
  // Auto bills (the standard patient bill) and Active Final bills are both editable.
  // Only LOCKED Final bills are immutable.
  const canEdit   = !isLocked;
  // The Lock/Generate flow only applies to Final bills (snapshot for audit).
  const canLock   = isFinal && !isLocked;

  // Live totals (for the edit panel summary).
  const subtotal = services.reduce(
    (s, x) => s + Number(x.unitPrice ?? x.unit_price ?? 0) * Number(x.quantity || 1), 0
  );
  const grandTotal = round2(subtotal - Number(discount || 0) + Number(additional || 0));

  const print = async () => {
    try { await openPdf(printApi.billUrl(bill.id)); }
    catch (e) { notify(e.message, 'error'); }
  };

  const addLine = () => {
    if (!picked) { notify('Pick a service', 'warning'); return; }
    const price = round2(Number(pickedPrice || picked.price || 0));
    if (isNaN(price) || price < 0) { notify('Invalid price', 'warning'); return; }
    const qty = Math.max(1, parseInt(pickedQty || 1, 10));
    setServices([
      ...services,
      { serviceId: picked.id, serviceName: picked.name, unitPrice: price, quantity: qty },
    ]);
    setPicked(null); setPickedPrice(''); setPickedQty(1);
  };

  const updateLine = (idx, patch) => {
    setServices(services.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const removeLine = (idx) => {
    setServices(services.filter((_, i) => i !== idx));
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      await billsApi.update(bill.id, {
        services: services.map((s) => ({
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          unitPrice: Number(s.unitPrice ?? s.unit_price),
          quantity: Number(s.quantity),
        })),
        discount: Number(discount || 0),
        additional: Number(additional || 0),
        notes,
      });
      notify('Saved', 'success');
      setEditing(false);
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Lock = persist any pending edits, THEN flip status to LOCKED. Doing it
  // in this order means clicking "Generate Final Bill" always uses the
  // amounts visible in the form.
  const lockNow = async () => {
    try {
      if (editing) {
        await billsApi.update(bill.id, {
          services: services.map((s) => ({
            serviceId: s.serviceId,
            serviceName: s.serviceName,
            unitPrice: Number(s.unitPrice ?? s.unit_price),
            quantity: Number(s.quantity),
          })),
          discount: Number(discount || 0),
          additional: Number(additional || 0),
          notes,
        });
      }
      await billsApi.lock(bill.id);
      notify('Final bill generated and locked', 'success');
      setEditing(false);
      setLockDlg(false);
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Lock failed', 'error');
    }
  };

  return (
    <Box>
      {/* ---- Title bar ---- */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} gap={2} flexWrap="wrap">
        <Box>
          <Typography variant="h5">
            {isAuto ? 'Auto Generated Bill' : 'Final / Edited Bill'}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip label={bill.billNumber} color={isAuto ? 'primary' : 'secondary'} variant="outlined" />
            <Chip label={bill.billType} color={isAuto ? 'primary' : 'secondary'} size="small" />
            <Chip label={bill.status} color={isLocked ? 'success' : 'warning'} size="small" />
            {bill.parentBillId && (
              <Chip label="Linked to Auto" size="small" component={RouterLink}
                to={`/bills/${bill.parentBillId}`} clickable variant="outlined" />
            )}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={print} variant="contained" startIcon={<PrintIcon />}>Print / PDF</Button>
          {canEdit && !editing && (
            <Button onClick={() => setEditing(true)} variant="outlined" startIcon={<EditIcon />}>
              Edit
            </Button>
          )}
          {canEdit && editing && (
            <Button onClick={saveEdits} variant="contained" color="success"
              startIcon={<SaveIcon />} disabled={saving}>
              {saving ? <CircularProgress size={20} color="inherit" /> : 'Save'}
            </Button>
          )}
          {canLock && (
            <Button onClick={() => setLockDlg(true)} variant="outlined" color="success"
              startIcon={<LockIcon />}>
              Generate Final Bill
            </Button>
          )}
        </Stack>
      </Stack>

      {isAuto && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Standard patient bill at the default consultation rate
          (New Case ₹400 / Old Case ₹200). Print directly for most patients.
          If a patient asks for a different amount, click <b>Edit</b>, change the price,
          and <b>Save</b> — then print.
        </Alert>
      )}
      {isFinal && isLocked && (
        <Alert severity="success" sx={{ mb: 2 }}>
          This Final Bill is locked. Print or download the PDF — edits are no longer allowed.
        </Alert>
      )}
      {isFinal && !isLocked && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This Final Bill is editable. Make changes, then click <b>Generate Final Bill</b> to lock it
          before handing the printed copy to the patient.
        </Alert>
      )}

      {/* ---- Patient / Doctor info ---- */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="overline" color="text.secondary">Patient</Typography>
              <Stack spacing={0.5}>
                <Row label="Name"        value={bill.patientName} />
                <Row label="UHID"        value={bill.patientCode} />
                <Row label="Mobile"      value={bill.mobile} />
                <Row label="Age/Gender"  value={`${bill.age ?? '—'} / ${bill.gender || '—'}`} />
                <Row label="Village"     value={bill.village} />
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="overline" color="text.secondary">Visit</Typography>
              <Stack spacing={0.5}>
                <Row label="Case No"   value={bill.caseNumber} />
                <Row label="Case Type" value={bill.caseType === 'NEW' ? 'New Case' : 'Old Case'} />
                <Row label="Visit"     value={`${new Date(bill.visitDate).toLocaleDateString('en-IN')} ${bill.visitTime || ''}`} />
                <Row label="By"        value={bill.createdByName} />
                <Row label="Created"   value={new Date(bill.createdAt).toLocaleString('en-IN')} />
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ---- Services table ---- */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>Services</Typography>
          <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Service</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Unit Price</TableCell>
                <TableCell align="right">Total</TableCell>
                {canEdit && editing && <TableCell align="right">Action</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit && editing ? 5 : 4}>
                    <Typography color="text.secondary">No services.</Typography>
                  </TableCell>
                </TableRow>
              )}
              {services.map((s, idx) => {
                const unit = Number(s.unitPrice ?? s.unit_price ?? 0);
                const qty = Number(s.quantity || 1);
                const total = round2(unit * qty);
                return (
                  <TableRow key={idx} hover>
                    <TableCell>
                      {canEdit && editing
                        ? <TextField size="small" value={s.serviceName}
                            onChange={(e) => updateLine(idx, { serviceName: e.target.value })} fullWidth />
                        : s.serviceName}
                    </TableCell>
                    <TableCell align="right" sx={{ width: 90 }}>
                      {canEdit && editing
                        ? <TextField size="small" type="number" value={s.quantity}
                            onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                            inputProps={{ min: 1 }} />
                        : qty}
                    </TableCell>
                    <TableCell align="right" sx={{ width: 130 }}>
                      {canEdit && editing
                        ? <TextField size="small" type="number"
                            value={s.unitPrice ?? s.unit_price ?? 0}
                            onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                            inputProps={{ min: 0 }} />
                        : money(unit)}
                    </TableCell>
                    <TableCell align="right" sx={{ width: 110, fontWeight: 600 }}>{money(total)}</TableCell>
                    {canEdit && editing && (
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => removeLine(idx)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          
              </Table>
              </TableContainer>

          {canEdit && editing && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Add a service</Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={5}>
                  <Autocomplete
                    options={serviceMaster}
                    value={picked}
                    onChange={(_, v) => {
                      setPicked(v);
                      if (v) setPickedPrice(String(v.price ?? ''));
                    }}
                    getOptionLabel={(o) => o ? `${o.name} (₹${o.price})` : ''}
                    isOptionEqualToValue={(o, v) => o?.id === v?.id}
                    renderInput={(p) => <TextField {...p} label="Service" />}
                  />
                </Grid>
                <Grid item xs={4} sm={3}>
                  <TextField fullWidth label="Unit Price" type="number"
                    value={pickedPrice} onChange={(e) => setPickedPrice(e.target.value)} />
                </Grid>
                <Grid item xs={4} sm={2}>
                  <TextField fullWidth label="Qty" type="number"
                    value={pickedQty} onChange={(e) => setPickedQty(e.target.value)}
                    inputProps={{ min: 1 }} />
                </Grid>
                <Grid item xs={4} sm={2}>
                  <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={addLine}>
                    Add
                  </Button>
                </Grid>
              </Grid>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---- Summary ---- */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              {canEdit && editing && (
                <Stack spacing={2}>
                  <TextField label="Discount" type="number" value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
                  <TextField label="Additional Charges" type="number" value={additional}
                    onChange={(e) => setAdditional(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
                  <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                    multiline rows={2} />
                </Stack>
              )}
              {!(canEdit && editing) && bill.notes && (
                <>
                  <Typography variant="overline" color="text.secondary">Notes</Typography>
                  <Typography variant="body2">{bill.notes}</Typography>
                </>
              )}
            </Grid>
            <Grid item xs={12} md={6}>
              <Stack spacing={1} alignItems="flex-end">
                <Row label="Subtotal"    value={money(canEdit && editing ? subtotal : bill.subtotal)} compact />
                <Row label="Discount"    value={`- ${money(discount)}`}    compact />
                <Row label="Additional"  value={money(additional)}         compact />
                <Box sx={{ pt: 1, borderTop: '1px solid #e0e0e0', width: '60%', textAlign: 'right' }}>
                  <Typography variant="body2" color="text.secondary">GRAND TOTAL</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {money(canEdit && editing ? grandTotal : bill.total)}
                  </Typography>
                </Box>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box>
        <Button onClick={() => navigate(-1)}>Back</Button>
      </Box>

      {/* ---- Lock dialog ---- */}
      <Dialog open={lockDlg} onClose={() => setLockDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Generate Final Bill</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {editing
              ? 'Your current edits will be saved and the bill will then be locked. No further changes can be made after this.'
              : 'The bill will be locked. No further changes can be made after this.'}
          </Alert>
          <Typography variant="body2">
            Confirm grand total of <b>{money(canEdit && editing ? grandTotal : bill.total)}</b>?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setLockDlg(false)}>Cancel</Button>
          <Button variant="contained" color="success" startIcon={<LockIcon />} onClick={lockNow}>
            {editing ? 'Save, Lock & Generate' : 'Lock & Generate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Row({ label, value, compact }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, justifyContent: compact ? 'flex-end' : 'flex-start', width: compact ? '60%' : 'auto' }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 100 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{value || '—'}</Typography>
    </Box>
  );
}
