/**
 * Admin reminders page.
 * - List of every reminder (active windows highlighted)
 * - Add / edit dialog with text + datetime "from" + "to" pickers
 */
import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Button, IconButton, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Stack, CircularProgress, Chip,
  Divider, Paper, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import HistoryIcon from '@mui/icons-material/History';
import { DateCalendar, TimePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import EventIcon from '@mui/icons-material/Event';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import Tooltip from '@mui/material/Tooltip';

import { remindersApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const isActive = (r) => {
  const now = dayjs();
  return now.isAfter(dayjs(r.startsAt)) && now.isBefore(dayjs(r.endsAt));
};

const formatRange = (start, end) => {
  const s = dayjs(start).format('DD MMM YY, HH:mm');
  const e = dayjs(end).format('DD MMM YY, HH:mm');
  return `${s}  →  ${e}`;
};

const emptyForm = () => ({
  text: '',
  type: 'SHORT_TERM',
  // ADMIN is always included by the backend; the form only toggles the
  // optional extra roles (Receptionist + Medical Officer).
  extraRoles: [],
  startsAt: dayjs(),
  endsAt: dayjs().add(7, 'day'),
});

const ROLE_OPTIONS = [
  { key: 'RECEPTIONIST',    label: 'Receptionist' },
  { key: 'MEDICAL_OFFICER', label: 'Medical Officer' },
];

const ROLE_SHORT = {
  ADMIN:           'Admin',
  RECEPTIONIST:    'Receptionist',
  MEDICAL_OFFICER: 'M. Officer',
};

// Quick presets per type. Short-term covers today..month, long-term
// jumps in months / years and lets the admin set when the reminder
// should *start* firing too (e.g. start 11 months out, end 1 year out).
const PRESETS = {
  SHORT_TERM: [
    { key: 'today',     label: 'Today',         apply: () => ({ startsAt: dayjs(),                              endsAt: dayjs().endOf('day') }) },
    { key: 'tomorrow',  label: 'Tomorrow',      apply: () => ({ startsAt: dayjs().add(1, 'day').startOf('day'), endsAt: dayjs().add(1, 'day').endOf('day') }) },
    { key: 'week',      label: 'Next 7 days',   apply: () => ({ startsAt: dayjs(),                              endsAt: dayjs().add(7, 'day').endOf('day') }) },
    { key: 'month',     label: 'Next 30 days',  apply: () => ({ startsAt: dayjs(),                              endsAt: dayjs().add(30, 'day').endOf('day') }) },
  ],
  LONG_TERM: [
    { key: '3mo',       label: 'In 3 months',   apply: () => ({ startsAt: dayjs().add(3,  'month'),  endsAt: dayjs().add(3,  'month').add(7, 'day').endOf('day') }) },
    { key: '6mo',       label: 'In 6 months',   apply: () => ({ startsAt: dayjs().add(6,  'month'),  endsAt: dayjs().add(6,  'month').add(7, 'day').endOf('day') }) },
    { key: '1y',        label: 'In 1 year',     apply: () => ({ startsAt: dayjs().add(1,  'year'),   endsAt: dayjs().add(1,  'year').add(14, 'day').endOf('day') }) },
    { key: '2y',        label: 'In 2 years',    apply: () => ({ startsAt: dayjs().add(2,  'year'),   endsAt: dayjs().add(2,  'year').add(14, 'day').endOf('day') }) },
  ],
};

const TYPE_LABEL = {
  SHORT_TERM: 'Short term',
  LONG_TERM:  'Long term',
};

// Compose a date (from calendar) with a time (from TimePicker) into one dayjs.
const composeDateTime = (datePart, timePart) =>
  datePart
    .hour(timePart.hour())
    .minute(timePart.minute())
    .second(0)
    .millisecond(0);

const formatDuration = (start, end) => {
  if (!start || !end || !end.isAfter(start)) return 'End must be after start';
  const totalMin = end.diff(start, 'minute');
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin - days * 24 * 60) / 60);
  const mins  = totalMin - days * 24 * 60 - hours * 60;
  const parts = [];
  if (days)  parts.push(`${days} day${days  > 1 ? 's' : ''}`);
  if (hours) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (!days && !hours) parts.push(`${mins} min`);
  return parts.join(', ');
};

export default function Reminders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const { notify } = useSnackbar();

  const load = async () => {
    setLoading(true);
    try {
      setRows(await remindersApi.list());
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load reminders', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };
  const openEdit = (r) => {
    setEditing(r);
    const targetRoles = Array.isArray(r.targetRoles) ? r.targetRoles : [];
    setForm({
      text: r.text,
      type: r.type || 'SHORT_TERM',
      extraRoles: targetRoles.filter((x) => x !== 'ADMIN'),
      startsAt: dayjs(r.startsAt),
      endsAt:   dayjs(r.endsAt),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.text.trim()) return notify('Reminder text is required', 'error');
    if (!form.startsAt || !form.endsAt) return notify('Both dates are required', 'error');
    if (!form.endsAt.isAfter(form.startsAt))
      return notify('End must be after start', 'error');
    const payload = {
      text: form.text.trim(),
      type: form.type || 'SHORT_TERM',
      targetRoles: ['ADMIN', ...(form.extraRoles || [])],
      startsAt: form.startsAt.toISOString(),
      endsAt:   form.endsAt.toISOString(),
    };
    try {
      if (editing) {
        await remindersApi.update(editing.id, payload);
        notify('Reminder updated', 'success');
      } else {
        await remindersApi.create(payload);
        notify('Reminder added', 'success');
      }
      setOpen(false);
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete reminder "${r.text.slice(0, 40)}…"?`)) return;
    try {
      await remindersApi.remove(r.id);
      notify('Reminder deleted', 'success');
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Delete failed', 'error');
    }
  };

  // Mark reminder complete — reminder disappears from the bell / login
  // popup but stays visible in this admin table with a "Completed" chip.
  const markComplete = async (r) => {
    try {
      await remindersApi.complete(r.id);
      notify(`Marked "${r.text.slice(0, 32)}${r.text.length > 32 ? '…' : ''}" as completed`, 'success');
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to mark complete', 'error');
    }
  };

  // Undo the completion (accidentally clicked, or the task came back).
  const reopen = async (r) => {
    try {
      await remindersApi.uncomplete(r.id);
      notify('Reminder reopened', 'success');
      load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to reopen', 'error');
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5">Reminders</Typography>
        <Button onClick={openCreate} variant="contained" startIcon={<AddIcon />}>
          Add Reminder
        </Button>
      </Stack>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Reminder</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Visible to</TableCell>
                    <TableCell>Window</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Added By</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => {
                    const completed = !!r.completedAt;
                    const active = !completed && isActive(r);
                    const rowSx = completed
                      ? { backgroundColor: '#f5f7fa', color: 'text.disabled' }
                      : active
                        ? { backgroundColor: '#fff7e6' }
                        : undefined;
                    return (
                      <TableRow key={r.id} hover sx={rowSx}>
                        <TableCell sx={{
                          maxWidth: 360, whiteSpace: 'pre-wrap',
                          textDecoration: completed ? 'line-through' : 'none',
                          color: completed ? 'text.disabled' : 'text.primary',
                        }}>{r.text}</TableCell>
                        <TableCell>
                          {r.type === 'LONG_TERM' ? (
                            <Chip size="small" icon={<HistoryIcon />} label="Long term"
                                  sx={{ bgcolor: '#ede7f6', color: '#3c3489', fontWeight: 600 }} />
                          ) : (
                            <Chip size="small" icon={<BoltIcon />} label="Short term"
                                  sx={{ bgcolor: '#e1f5ee', color: '#0f6e56', fontWeight: 600 }} />
                          )}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            {(r.targetRoles || ['ADMIN']).map((role) => (
                              <Chip
                                key={role}
                                size="small"
                                label={ROLE_SHORT[role] || role}
                                variant={role === 'ADMIN' ? 'filled' : 'outlined'}
                                sx={{
                                  height: 20, fontSize: 11,
                                  ...(role === 'ADMIN'
                                    ? { bgcolor: '#e6f1fb', color: '#0c447c' }
                                    : {}),
                                }}
                              />
                            ))}
                          </Stack>
                        </TableCell>
                        <TableCell>{formatRange(r.startsAt, r.endsAt)}</TableCell>
                        <TableCell>
                          {completed ? (
                            <Tooltip title={r.completedByName ? `Completed by ${r.completedByName}` : 'Completed'}>
                              <Chip
                                size="small"
                                color="success"
                                icon={<CheckCircleIcon />}
                                label={`Completed ${dayjs(r.completedAt).format('DD MMM, HH:mm')}`}
                              />
                            </Tooltip>
                          ) : active ? (
                            <Chip size="small" color="warning" icon={<NotificationsActiveIcon />} label="Active" />
                          ) : dayjs().isBefore(dayjs(r.startsAt)) ? (
                            <Chip size="small" label="Scheduled" />
                          ) : (
                            <Chip size="small" variant="outlined" label="Past" />
                          )}
                        </TableCell>
                        <TableCell>{r.createdByName || '—'}</TableCell>
                        <TableCell align="right">
                          {/* Complete / reopen — the "finish the activity" flow */}
                          {completed ? (
                            <Tooltip title="Reopen — undo completion">
                              <IconButton onClick={() => reopen(r)} size="small">
                                <ReplayIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Mark this reminder complete">
                              <Button
                                onClick={() => markComplete(r)}
                                size="small"
                                variant="contained"
                                color="success"
                                startIcon={<CheckCircleIcon />}
                                sx={{ mr: 0.5, py: 0.25, minWidth: 0 }}
                              >
                                Complete
                              </Button>
                            </Tooltip>
                          )}
                          <IconButton
                            onClick={() => openEdit(r)}
                            size="small"
                            disabled={completed}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton onClick={() => remove(r)} size="small">
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={7}>No reminders yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            background: 'linear-gradient(135deg, #fff7e0 0%, #fff 70%)',
            borderBottom: '1px solid #f0e5c5',
          }}
        >
          <NotificationsActiveIcon sx={{ color: '#d97706' }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
              {editing ? 'Edit Reminder' : 'New Reminder'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Choose what to remember and when it should pop up.
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            <TextField
              label="What to remember"
              placeholder="e.g. Pay the electricity bill, Order new gloves..."
              fullWidth multiline minRows={2}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              autoFocus
            />

            {/* Reminder type */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Reminder type
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={form.type}
                onChange={(_, v) => v && setForm({ ...form, type: v })}
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    px: 2, py: 1, textTransform: 'none',
                    border: '1px solid',
                    borderColor: 'divider',
                    fontWeight: 600,
                  },
                  '& .Mui-selected': {
                    bgcolor: '#fff7e0 !important',
                    borderColor: '#f59e0b !important',
                    color: '#92400e',
                  },
                }}
              >
                <ToggleButton value="SHORT_TERM">
                  <BoltIcon fontSize="small" sx={{ mr: 0.75 }} />
                  Short term
                </ToggleButton>
                <ToggleButton value="LONG_TERM">
                  <HistoryIcon fontSize="small" sx={{ mr: 0.75 }} />
                  Long term
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                {form.type === 'LONG_TERM'
                  ? 'Long-term reminders are scheduled months or years out. Pick when they should start nagging you.'
                  : 'Short-term reminders fire within today, this week or this month.'}
              </Typography>
            </Box>

            {/* Visible to — admin is always implicit */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Visible to
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                <Chip
                  size="small"
                  label="Admin (always)"
                  sx={{ bgcolor: '#e6f1fb', color: '#0c447c', fontWeight: 600 }}
                />
                {ROLE_OPTIONS.map((opt) => {
                  const on = form.extraRoles.includes(opt.key);
                  return (
                    <Chip
                      key={opt.key}
                      size="small"
                      label={opt.label}
                      onClick={() => setForm({
                        ...form,
                        extraRoles: on
                          ? form.extraRoles.filter((x) => x !== opt.key)
                          : [...form.extraRoles, opt.key],
                      })}
                      variant={on ? 'filled' : 'outlined'}
                      sx={on
                        ? { bgcolor: '#fef3c7', color: '#92400e', borderColor: '#fcd34d', fontWeight: 600 }
                        : { borderRadius: 999 }}
                    />
                  );
                })}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                By default only the admin sees the reminder. Toggle a role to also show it to that staff.
              </Typography>
            </Box>

            {/* Quick presets — scoped to the chosen type */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Quick pick
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(PRESETS[form.type] || []).map((p) => (
                  <Chip
                    key={p.key}
                    label={p.label}
                    onClick={() => setForm({ ...form, ...p.apply() })}
                    variant="outlined"
                    sx={{ borderRadius: 999 }}
                  />
                ))}
              </Stack>
            </Box>

            {/* Two-column calendar layout */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch">
              {/* FROM */}
              <Paper
                variant="outlined"
                sx={{
                  flex: 1, p: 1.5, borderRadius: 2,
                  borderColor: '#cbe3ff', bgcolor: '#fbfdff',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <EventIcon fontSize="small" sx={{ color: '#1e7fb0' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>From</Typography>
                  <Chip
                    size="small"
                    label={form.startsAt ? form.startsAt.format('DD MMM YYYY, HH:mm') : '—'}
                    sx={{ ml: 'auto', bgcolor: '#e6f1fb', color: '#0c447c' }}
                  />
                </Stack>
                <DateCalendar
                  value={form.startsAt}
                  onChange={(v) => setForm({
                    ...form,
                    startsAt: composeDateTime(v, form.startsAt || dayjs()),
                  })}
                  sx={{ width: '100%', m: 0, '& .MuiPickersDay-root': { fontSize: 13 } }}
                />
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                  <AccessTimeIcon fontSize="small" color="action" />
                  <TimePicker
                    value={form.startsAt}
                    onChange={(v) => v && setForm({
                      ...form,
                      startsAt: composeDateTime(form.startsAt || dayjs(), v),
                    })}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </Stack>
              </Paper>

              {/* TO */}
              <Paper
                variant="outlined"
                sx={{
                  flex: 1, p: 1.5, borderRadius: 2,
                  borderColor: '#ffd3a8', bgcolor: '#fffaf3',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <EventBusyIcon fontSize="small" sx={{ color: '#b56b14' }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>To</Typography>
                  <Chip
                    size="small"
                    label={form.endsAt ? form.endsAt.format('DD MMM YYYY, HH:mm') : '—'}
                    sx={{ ml: 'auto', bgcolor: '#faeeda', color: '#854f0b' }}
                  />
                </Stack>
                <DateCalendar
                  value={form.endsAt}
                  minDate={form.startsAt || undefined}
                  onChange={(v) => setForm({
                    ...form,
                    endsAt: composeDateTime(v, form.endsAt || dayjs().endOf('day')),
                  })}
                  sx={{ width: '100%', m: 0, '& .MuiPickersDay-root': { fontSize: 13 } }}
                />
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                  <AccessTimeIcon fontSize="small" color="action" />
                  <TimePicker
                    value={form.endsAt}
                    onChange={(v) => v && setForm({
                      ...form,
                      endsAt: composeDateTime(form.endsAt || dayjs().endOf('day'), v),
                    })}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </Stack>
              </Paper>
            </Stack>

            {/* Duration banner */}
            <Paper
              variant="outlined"
              sx={{
                p: 1.5, borderRadius: 2, display: 'flex',
                alignItems: 'center', gap: 1.5,
                borderColor: form.endsAt?.isAfter(form.startsAt) ? '#cfead8' : '#f5c1c1',
                bgcolor: form.endsAt?.isAfter(form.startsAt) ? '#f3faf6' : '#fdf2f2',
              }}
            >
              <HourglassBottomIcon
                fontSize="small"
                sx={{ color: form.endsAt?.isAfter(form.startsAt) ? '#3b6d11' : '#a32d2d' }}
              />
              <Box>
                <Typography variant="caption" color="text.secondary">Active duration</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {formatDuration(form.startsAt, form.endsAt)}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', textAlign: 'right' }}>
                Reminder pops up at login and shows in the bell menu while the current time is inside this window.
              </Typography>
            </Paper>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} variant="contained" size="large">
            {editing ? 'Save changes' : 'Add reminder'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
