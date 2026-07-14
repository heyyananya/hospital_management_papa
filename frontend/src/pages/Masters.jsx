import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Tabs, Tab, Button, Table, TableHead,
  TableRow, TableCell, TableContainer, TableBody, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Stack, CircularProgress,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';

import { mastersApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

// Definition of each master tab and the columns it uses.
const TABS = [
  { key: 'service_master',       label: 'Services & Prices',      fields: ['code', 'name', 'price'] },
  { key: 'known_disease_master', label: 'Known Case Of (KCO)',    fields: ['code', 'name'] },
  { key: 'complaint_master',     label: 'Complaints',             fields: ['code', 'name'] },
  { key: 'advice_master',        label: 'Advice',                 fields: ['text'] },
  { key: 'plan_master',          label: 'Plan',                   fields: ['code', 'name'] },
  { key: 'examination_master',   label: 'Examination',            fields: ['code', 'label'] },
  { key: 'investigation_master', label: 'Investigation',          fields: ['code', 'name'] },
  { key: 'medicine_master',      label: 'Medicines',              fields: ['code', 'name', 'form'] },
  { key: 'languages',            label: 'Languages',              fields: ['name'] },
  { key: 'villages',             label: 'Villages',               fields: ['name', 'taluka', 'district', 'state'] },
  { key: 'referrals',            label: 'Referrals',              fields: ['name'] },
];

export default function Masters() {
  const [tab, setTab] = useState(0);
  const def = TABS[tab];

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const { notify } = useSnackbar();

  const load = async () => {
    setLoading(true);
    try {
      const r = await mastersApi.list(def.key, { activeOnly: false });
      setRows(r);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null);
    setForm(Object.fromEntries(def.fields.map((f) => [f, ''])));
    setOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setForm({ ...row });
    setOpen(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await mastersApi.update(def.key, editing.id, form);
        notify('Updated', 'success');
      } else {
        await mastersApi.create(def.key, form);
        notify('Created', 'success');
      }
      setOpen(false);
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    }
  };

  const remove = async (row) => {
    try {
      await mastersApi.remove(def.key, row.id);
      notify('Deactivated', 'success');
      load();
    } catch (e) {
      if (e?.cancelled) return;
      notify(e?.response?.data?.message || 'Failed', 'error');
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Master Tables</Typography>
      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          {TABS.map((t) => <Tab key={t.key} label={t.label} />)}
        </Tabs>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button onClick={openCreate} startIcon={<AddIcon />} variant="contained">Add</Button>
          </Box>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : (
            <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  {def.fields.map((f) => <TableCell key={f} sx={{ textTransform: 'capitalize' }}>{f}</TableCell>)}
                  <TableCell>Active</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    {def.fields.map((f) => <TableCell key={f}>{r[f]}</TableCell>)}
                    <TableCell>{r.isActive ? 'Yes' : 'No'}</TableCell>
                    <TableCell align="right">
                      <IconButton onClick={() => openEdit(r)}><EditIcon /></IconButton>
                      <IconButton onClick={() => remove(r)}><DeleteOutlineIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={def.fields.length + 2}>No records.</TableCell></TableRow>
                )}
              </TableBody>
            
              </Table>
              </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit' : 'Add'} {def.label}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {def.fields.map((f) => (
              <TextField key={f} label={f} value={form[f] || ''}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })} fullWidth />
            ))}
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
