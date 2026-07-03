import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableContainer,
  TableBody, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Stack, Button, Chip, CircularProgress, InputAdornment, Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';

import { mastersApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const money = (n) => `₹ ${Number(n || 0).toFixed(2)}`;

const blankForm = { code: '', name: '', price: '' };

export default function ServicesMaster() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(blankForm);
  const { notify } = useSnackbar();

  const load = async () => {
    setLoading(true);
    try {
      const r = await mastersApi.list('service_master', { activeOnly: false });
      setRows(r);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm);
    setOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({ code: row.code, name: row.name, price: row.price });
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      notify('Code and Name are required', 'warning');
      return;
    }
    if (form.price === '' || isNaN(Number(form.price))) {
      notify('Enter a valid price', 'warning');
      return;
    }
    try {
      const payload = {
        code: form.code.trim().toUpperCase().replace(/\s+/g, '_'),
        name: form.name.trim(),
        price: Number(form.price),
      };
      if (editing) {
        await mastersApi.update('service_master', editing.id, payload);
        notify('Updated', 'success');
      } else {
        await mastersApi.create('service_master', payload);
        notify('Created', 'success');
      }
      setOpen(false);
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    }
  };

  const remove = async (row) => {
    if (['NEW_CASE', 'OLD_CASE'].includes(row.code)) {
      notify(`${row.code} is a system service - deactivate not allowed`, 'warning');
      return;
    }
    if (!window.confirm(`Deactivate "${row.name}"?`)) return;
    try {
      await mastersApi.remove('service_master', row.id);
      notify('Deactivated', 'success');
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed', 'error');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Services & Prices</Typography>
        <Button onClick={openCreate} startIcon={<AddIcon />} variant="contained">
          Add Service
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        These prices are used when billing a visit. <b>NEW_CASE</b> is auto-charged when a new
        patient is registered, and <b>OLD_CASE</b> when a returning patient is added to the queue.
        Other services (ECG, Injection, etc.) can be added by the receptionist on the visit's billing screen.
      </Alert>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Code</TableCell>
                  <TableCell>Service Name</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Chip size="small" label={r.code}
                        color={['NEW_CASE', 'OLD_CASE'].includes(r.code) ? 'primary' : 'default'} />
                    </TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{money(r.price)}</TableCell>
                    <TableCell>
                      <Chip size="small" color={r.isActive ? 'success' : 'default'}
                        label={r.isActive ? 'Active' : 'Inactive'} />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton onClick={() => openEdit(r)} size="small"><EditIcon /></IconButton>
                      <IconButton onClick={() => remove(r)} size="small"><DeleteOutlineIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={5}>No services yet.</TableCell></TableRow>
                )}
              </TableBody>
            
              </Table>
              </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Service' : 'Add Service'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Code *"
              fullWidth
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={!!editing && ['NEW_CASE', 'OLD_CASE'].includes(editing.code)}
              helperText="Short uppercase identifier, e.g. ECG, X_RAY"
            />
            <TextField
              label="Service Name *"
              fullWidth
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. ECG, Nebulization, BP Check"
            />
            <TextField
              label="Price *"
              type="number"
              fullWidth
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
              inputProps={{ min: 0, step: 1 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
