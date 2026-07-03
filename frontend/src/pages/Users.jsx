import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableContainer,
  TableBody, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Stack, Button, Chip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import AddIcon from '@mui/icons-material/Add';

import { usersApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const ROLES = ['ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'];

export default function Users() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', fullName: '', role: 'RECEPTIONIST', password: '' });
  const { notify } = useSnackbar();

  const load = () => usersApi.list().then(setRows).catch((e) => notify(e?.response?.data?.message || 'Failed', 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null);
    setForm({ username: '', fullName: '', role: 'RECEPTIONIST', password: '' });
    setOpen(true);
  };
  const openEdit = (u) => {
    setEditing(u);
    setForm({ username: u.username, fullName: u.fullName, role: u.role, password: '' });
    setOpen(true);
  };

  const save = async () => {
    try {
      if (editing) {
        const { password, ...rest } = form;
        const payload = password ? form : rest;
        await usersApi.update(editing.id, payload);
        notify('Updated', 'success');
      } else {
        await usersApi.create(form);
        notify('User created', 'success');
      }
      setOpen(false);
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    }
  };

  const deactivate = async (u) => {
    if (!window.confirm(`Deactivate user "${u.username}"?`)) return;
    try {
      await usersApi.remove(u.id);
      notify('Deactivated', 'success');
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed', 'error');
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Users</Typography>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button onClick={openCreate} variant="contained" startIcon={<AddIcon />}>Add User</Button>
          </Box>
          <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Full Name</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.fullName}</TableCell>
                  <TableCell><Chip size="small" label={u.role} /></TableCell>
                  <TableCell>
                    <Chip size="small" color={u.isActive ? 'success' : 'default'}
                      label={u.isActive ? 'Active' : 'Inactive'} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => openEdit(u)}><EditIcon /></IconButton>
                    <IconButton onClick={() => deactivate(u)}><BlockIcon /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          
              </Table>
              </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit User' : 'Add User'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Username" fullWidth disabled={!!editing}
              value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <TextField label="Full Name" fullWidth
              value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <TextField select label="Role" fullWidth
              value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
            </TextField>
            <TextField label={editing ? 'Reset Password (optional)' : 'Password'}
              type="password" fullWidth
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
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
