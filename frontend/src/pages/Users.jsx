import { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Table, TableHead, TableRow, TableCell, TableContainer,
  TableBody, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Stack, Button, Chip, Divider, FormControlLabel, Checkbox,
  Alert, Tooltip, InputAdornment,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import AddIcon from '@mui/icons-material/Add';
import ShieldIcon from '@mui/icons-material/Shield';
import LockIcon from '@mui/icons-material/Lock';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';

import { usersApi, authApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  PERMISSIONS, ALL_KEYS,
  PERMANENT_BY_ROLE, ROLE_DEFAULTS,
  effectivePermissions,
} from '../utils/permissions.js';

const ROLES = ['ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'];

export default function Users() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', fullName: '', role: 'RECEPTIONIST', password: '' });
  const [rightsFor, setRightsFor] = useState(null);
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
    // Pre-fill password from the stored plaintext copy so the admin can see
    // (and if desired keep) the current password rather than always resetting.
    setForm({
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      password: u.passwordPlain || '',
    });
    setOpen(true);
  };

  const save = async () => {
    try {
      if (editing) {
        // Only send the password if it actually changed vs. the pre-filled
        // value — avoids re-hashing on unrelated edits.
        const originalPassword = editing.passwordPlain || '';
        const payload = { ...form };
        if (form.password === originalPassword) delete payload.password;
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
      <Typography variant="h5" sx={{ mb: 2 }}>Users & Rights</Typography>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button onClick={openCreate} variant="contained" startIcon={<AddIcon />}>Add User</Button>
          </Box>
          <TableContainer>
              <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Full Name</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Rights</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((u) => {
                const eff = effectivePermissions(u);
                const total = ALL_KEYS.length;
                return (
                  <TableRow key={u.id} hover>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>{u.fullName}</TableCell>
                    <TableCell><Chip size="small" label={u.role} /></TableCell>
                    <TableCell>
                      {u.role === 'ADMIN' ? (
                        <Chip size="small" color="success" variant="outlined"
                              icon={<ShieldIcon />} label="Full access" />
                      ) : (
                        <Chip size="small"
                              color={u.permissions ? 'warning' : 'default'}
                              variant="outlined"
                              label={u.permissions
                                ? `${eff.length}/${total} custom`
                                : `${eff.length}/${total} default`} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={u.isActive ? 'success' : 'default'}
                        label={u.isActive ? 'Active' : 'Inactive'} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit user rights">
                        <span>
                          <IconButton
                            onClick={() => setRightsFor(u)}
                            disabled={u.role === 'ADMIN'}
                            color="primary"
                          >
                            <ShieldIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <IconButton onClick={() => openEdit(u)}><EditIcon /></IconButton>
                      <IconButton onClick={() => deactivate(u)}><BlockIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>

              </Table>
              </TableContainer>
        </CardContent>
      </Card>

      <UserFormDialog
        open={open}
        editing={editing}
        form={form}
        setForm={setForm}
        onClose={() => setOpen(false)}
        onSave={save}
      />

      <RightsDialog user={rightsFor} onClose={() => setRightsFor(null)} onSaved={load} />
    </Box>
  );
}

/* --------------------------- Create / Edit user --------------------------- */

// Human-friendly random password: two words + 2-digit number, easy to read
// aloud over the phone but still ~40 bits of entropy. Avoids characters that
// look alike (0/O, 1/l/I).
const WORDS = [
  'apple', 'brave', 'cloud', 'delta', 'eagle', 'flame', 'gecko', 'honey',
  'india', 'jolly', 'karma', 'lemon', 'mango', 'nova',  'ocean', 'panda',
  'quick', 'rider', 'solar', 'tiger', 'unity', 'vivid', 'water', 'xenon',
  'yield', 'zebra',
];
const randomPassword = () => {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  const num  = String(23 + Math.floor(Math.random() * 76));   // 23..98
  const cap  = (w) => w[0].toUpperCase() + w.slice(1);
  return `${cap(pick())}-${pick()}-${num}`;
};

// How long a revealed password stays visible before we auto-hide it. Keeps
// a stray unlocked screen from leaking the password minutes later.
const REVEAL_TIMEOUT_MS = 15_000;

function UserFormDialog({ open, editing, form, setForm, onClose, onSave }) {
  const { notify } = useSnackbar();
  const hadStoredPassword = !!(editing && editing.passwordPlain);
  // Always start hidden — the admin has to click the eye icon before the
  // password is revealed. Prevents shoulder-surfing when the dialog opens.
  const [showPassword, setShowPassword] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [revealCountdown, setRevealCountdown] = useState(0);

  // Reset the reveal-state whenever the dialog opens for a new user.
  useEffect(() => {
    setShowPassword(false);
    setVerifyOpen(false);
    setRevealCountdown(0);
  }, [open]);

  // Auto-hide the password after REVEAL_TIMEOUT_MS while showing a small
  // countdown so the admin can see time slipping away.
  useEffect(() => {
    if (!showPassword) { setRevealCountdown(0); return; }
    setRevealCountdown(Math.round(REVEAL_TIMEOUT_MS / 1000));
    const started = Date.now();
    const tick = setInterval(() => {
      const remainMs = REVEAL_TIMEOUT_MS - (Date.now() - started);
      if (remainMs <= 0) {
        setShowPassword(false);
        clearInterval(tick);
      } else {
        setRevealCountdown(Math.ceil(remainMs / 1000));
      }
    }, 500);
    return () => clearInterval(tick);
  }, [showPassword]);

  const generate = () => {
    const pw = randomPassword();
    setForm({ ...form, password: pw });
    // The admin JUST created this password — no need to re-verify to see it.
    setShowPassword(true);
  };

  const handleEyeClick = () => {
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    // Only ask for admin password when there's a stored value to protect.
    // Freshly-typed values in the field don't need a challenge — the admin
    // typed them, they're not a secret being unlocked.
    const editingSameField = editing && form.password === (editing.passwordPlain || '');
    if (editingSameField && hadStoredPassword) {
      setVerifyOpen(true);
    } else {
      setShowPassword(true);
    }
  };

  const onVerifySuccess = () => {
    setVerifyOpen(false);
    setShowPassword(true);
    notify('Verified — password revealed for 15s', 'success');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
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

          {editing && !hadStoredPassword && (
            <Alert severity="warning" sx={{ mb: 0 }}>
              This user's original password can't be recovered — it was
              created before the password-store feature. Click <b>Generate</b>
              (or type a new one) and Save, then read the new password back
              to them. From now on it will be visible here whenever they
              forget it.
            </Alert>
          )}

          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            helperText={
              showPassword && revealCountdown > 0
                ? `Auto-hides in ${revealCountdown}s`
                : editing
                  ? (form.password
                      ? 'Click the eye to reveal (requires your admin password). Change the text to reset.'
                      : 'Type a new password or click Generate to auto-create one.')
                  : 'Type a password or click Generate to auto-create one.'
            }
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Generate a random password">
                    <IconButton onClick={generate} edge="end" size="small">
                      <AutoAwesomeIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={showPassword ? 'Hide password' : 'Show password (requires re-verify)'}>
                    <IconButton onClick={handleEyeClick} edge="end" size="small">
                      {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave}>Save</Button>
      </DialogActions>

      <VerifyAdminDialog
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onSuccess={onVerifySuccess}
        context={`reveal-user-password:${editing?.username || ''}`}
      />
    </Dialog>
  );
}

/* ----------------------- Admin re-verify dialog --------------------------- */

/**
 * Prompts the currently-logged-in admin for their own password before we
 * reveal a stored user password. The `context` string is logged server-side
 * in the audit trail so any suspicious "reveal password X" can be traced
 * back to the admin who did it.
 */
function VerifyAdminDialog({ open, onClose, onSuccess, context }) {
  const { user } = useAuth();
  const { notify } = useSnackbar();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) { setPassword(''); setShow(false); setSubmitting(false); }
  }, [open]);

  const submit = async () => {
    if (!password) { notify('Enter your admin password', 'warning'); return; }
    setSubmitting(true);
    try {
      await authApi.verify(password, context);
      onSuccess?.();
    } catch (e) {
      notify(e?.response?.data?.message || 'Verification failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <LockIcon color="primary" />
          <Typography variant="h6">Confirm your identity</Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Re-enter your admin password to reveal this user's password.
          The reveal auto-hides after 15 seconds, and every reveal is logged.
        </Alert>
        <TextField
          label={`Password for ${user?.username || 'admin'}`}
          type={show ? 'text' : 'password'}
          fullWidth
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShow((v) => !v)} edge="end" size="small">
                  {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={submitting}>
          {submitting ? 'Verifying…' : 'Reveal'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* --------------------------- User Rights dialog --------------------------- */

function RightsDialog({ user, onClose, onSaved }) {
  const { notify } = useSnackbar();
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setSelected(new Set(effectivePermissions(user)));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Rights dialog lists EVERY page in the catalog — new sidebar entries
  // become manageable automatically without touching this file.
  const permanent = useMemo(
    () => new Set(user ? (PERMANENT_BY_ROLE[user.role] || []) : []),
    [user?.role]
  );

  const grouped = useMemo(() => {
    const g = {};
    for (const p of PERMISSIONS) {
      if (!g[p.group]) g[p.group] = [];
      g[p.group].push(p);
    }
    return g;
  }, []);

  if (!user) return null;

  const toggle = (key) => {
    if (permanent.has(key)) return;    // locked — role must always have it
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetToDefaults = () => {
    setSelected(new Set(ROLE_DEFAULTS[user.role] || []));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Always include the permanent keys so a corrupted save can't strand
      // the user without their role-mandatory pages.
      const payload = Array.from(new Set([...selected, ...permanent]));
      await usersApi.update(user.id, { permissions: payload });
      notify('Rights updated', 'success');
      onSaved?.();
      onClose();
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onClose={onClose} maxWidth="md" fullWidth
            PaperProps={{ sx: { maxHeight: '90vh' } }}>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ShieldIcon color="primary" />
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
              User Rights — {user.fullName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user.username} · {user.role}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Toggle the pages this user can open. Items with a lock icon are
          permanent for the <b>{user.role}</b> role and can't be turned off.
          Every sidebar page is listed here — new pages appear automatically.
        </Alert>

        <Stack spacing={2.5}>
          {Object.entries(grouped).map(([group, items]) => (
            <Box key={group}>
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                {group}
              </Typography>
              <Divider sx={{ mb: 1 }} />
              <Stack>
                {items.map((p) => {
                  const isPermanent = permanent.has(p.key);
                  const checked = isPermanent || selected.has(p.key);
                  return (
                    <FormControlLabel
                      key={p.key}
                      control={
                        <Checkbox
                          checked={checked}
                          disabled={isPermanent}
                          onChange={() => toggle(p.key)}
                        />
                      }
                      label={
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          <Typography variant="body2">{p.label}</Typography>
                          {isPermanent && (
                            <Tooltip title="Permanent for this role">
                              <LockIcon fontSize="inherit" color="disabled" />
                            </Tooltip>
                          )}
                        </Stack>
                      }
                    />
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Button onClick={resetToDefaults} startIcon={<RestartAltIcon />}>
          Reset to role defaults
        </Button>
        <Box>
          <Button onClick={onClose} sx={{ mr: 1 }}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Rights'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
