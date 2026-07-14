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
import RepeatIcon from '@mui/icons-material/Repeat';
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
  // For recurring reminders, "active" is only true on a firing day. The
  // authoritative check is server-side (bell / login popup uses /reminders
  // ?active=1 which does the recurrence math in SQL); this client check
  // just powers the row-highlight colour and is intentionally simple —
  // recurring rows never highlight the whole month as "active".
  if (r.recurrenceDayOfMonth) {
    if (now.isBefore(dayjs(r.startsAt)) || now.isAfter(dayjs(r.endsAt))) return false;
    const daysInMonth = now.daysInMonth();
    const target = Math.min(r.recurrenceDayOfMonth, daysInMonth);
    if (now.date() !== target) return false;
    const startMonths = dayjs(r.startsAt).year() * 12 + dayjs(r.startsAt).month();
    const nowMonths   = now.year() * 12 + now.month();
    const step = Math.max(1, r.recurrenceEveryMonths || 1);
    return ((nowMonths - startMonths) % step) === 0;
  }
  return now.isAfter(dayjs(r.startsAt)) && now.isBefore(dayjs(r.endsAt));
};

const ordinal = (n) => {
  const num = Number(n) || 0;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
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
  const [recurringOpen, setRecurringOpen] = useState(false);
  // When editing a RECURRING reminder we open the recurring dialog instead
  // of the standard one — its fields don't fit the single-window form.
  const [recurringEditing, setRecurringEditing] = useState(null);
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
    // Recurring reminders have their own dialog (typed dates, day-of-month,
    // every-N-months). The regular form doesn't have those inputs so we
    // route the two kinds to the right editor.
    if (r.recurrenceDayOfMonth) {
      setRecurringEditing(r);
      setRecurringOpen(true);
      return;
    }
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
    try {
      await remindersApi.remove(r.id);
      notify('Reminder deleted', 'success');
      load();
    } catch (e) {
      if (e?.cancelled) return;
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
        <Stack direction="row" spacing={1}>
          <Button
            onClick={() => setRecurringOpen(true)}
            variant="outlined"
            color="secondary"
            startIcon={<RepeatIcon />}
          >
            Monthly Reminder
          </Button>
          <Button onClick={openCreate} variant="contained" startIcon={<AddIcon />}>
            Add Reminder
          </Button>
        </Stack>
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
                          {r.recurrenceDayOfMonth ? (
                            <Chip
                              size="small"
                              icon={<RepeatIcon />}
                              label={`Monthly · ${ordinal(r.recurrenceDayOfMonth)}`}
                              sx={{ bgcolor: '#ede7f6', color: '#4527a0', fontWeight: 600 }}
                            />
                          ) : r.type === 'LONG_TERM' ? (
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

      <RecurringReminderDialog
        open={recurringOpen}
        editing={recurringEditing}
        onClose={() => { setRecurringOpen(false); setRecurringEditing(null); }}
        onCreated={load}
        notify={notify}
      />
    </Box>
  );
}

/* ================================================================
                       Recurring reminder
   ================================================================
 * Batch-creates one reminder row per firing date. Fields:
 *   - text            (name)
 *   - visible-to      (Admin always + optional Reception / MO)
 *   - start / end     (typed DD/MM/YYYY, no calendar popup)
 *   - dayOfMonth      1..31 (auto-clamped for short months — Feb 30 → Feb 28/29)
 *   - everyMonths     1..24 (repeat every N months)
 *
 * The generated dates are shown in a preview box so the admin can eyeball
 * exactly what's going to be created before clicking Create.
 */

const parseDMY = (s) => {
  // Strict DD/MM/YYYY parser — done by hand so we don't depend on the
  // dayjs customParseFormat plugin (which isn't currently loaded). Accepts
  // both "-" and "/" separators; four-digit year required.
  if (!s || typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = dayjs(`${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
  if (!d.isValid()) return null;
  // Guard against out-of-range days like 32/13/2026 that ISO would silently coerce.
  if (d.date() !== Number(dd) || (d.month() + 1) !== Number(mm)) return null;
  return d.startOf('day');
};

const generateFirings = ({ start, end, dayOfMonth, everyMonths }) => {
  if (!start || !end || !start.isValid() || !end.isValid()) return [];
  if (end.isBefore(start)) return [];
  const step = Math.max(1, parseInt(everyMonths, 10) || 1);
  const dom  = Math.min(31, Math.max(1, parseInt(dayOfMonth, 10) || 1));
  const dates = [];
  // Start from the month of `start`; if that month's target day is before
  // the start date, roll forward by `step`.
  let cursor = start.date(1);       // first of the start month
  for (let safety = 0; safety < 24 * 30 && dates.length < 60; safety++) {
    const daysInMonth = cursor.daysInMonth();
    const targetDay   = Math.min(dom, daysInMonth);   // Feb 30 → Feb 28/29
    const firing      = cursor.date(targetDay).startOf('day');
    if (firing.isAfter(end.endOf('day'))) break;
    if (!firing.isBefore(start)) dates.push(firing);
    cursor = cursor.add(step, 'month');
  }
  return dates;
};

function RecurringReminderDialog({ open, editing, onClose, onCreated, notify }) {
  const [text, setText]         = useState('');
  const [extraRoles, setExtra]  = useState([]);
  const [startStr, setStartStr] = useState(dayjs().format('DD/MM/YYYY'));
  const [endStr, setEndStr]     = useState(dayjs().add(1, 'year').format('DD/MM/YYYY'));
  const [dayOfMonth, setDom]    = useState(5);
  const [saving, setSaving]     = useState(false);
  // Fires every month by default — matches "select the date of every month".
  const everyMonths = 1;

  // When opening: pre-fill from `editing` if present; otherwise reset to
  // fresh values so an old edit doesn't leak into the next "new".
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const roles = Array.isArray(editing.targetRoles) ? editing.targetRoles : [];
      setText(editing.text || '');
      setExtra(roles.filter((x) => x !== 'ADMIN'));
      setStartStr(dayjs(editing.startsAt).format('DD/MM/YYYY'));
      setEndStr(dayjs(editing.endsAt).format('DD/MM/YYYY'));
      setDom(editing.recurrenceDayOfMonth || 5);
    } else {
      setText('');
      setExtra([]);
      setStartStr(dayjs().format('DD/MM/YYYY'));
      setEndStr(dayjs().add(1, 'year').format('DD/MM/YYYY'));
      setDom(5);
    }
  }, [open, editing]);

  const startDate = parseDMY(startStr);
  const endDate   = parseDMY(endStr);
  const firings   = generateFirings({ start: startDate, end: endDate, dayOfMonth, everyMonths });

  const dateErr = (!startDate || !endDate)
    ? 'Enter both dates as DD/MM/YYYY'
    : endDate.isBefore(startDate)
      ? 'End date must be after the start date'
      : null;

  const save = async () => {
    if (!text.trim()) return notify('Reminder name is required', 'error');
    if (dateErr)      return notify(dateErr, 'error');
    if (firings.length === 0) return notify('No firing dates fall inside this range', 'error');

    setSaving(true);
    try {
      const payload = {
        text: text.trim(),
        type: 'LONG_TERM',
        targetRoles: ['ADMIN', ...extraRoles],
        startsAt: startDate.startOf('day').toISOString(),
        endsAt:   endDate.endOf('day').toISOString(),
        recurrenceDayOfMonth: dayOfMonth,
        recurrenceEveryMonths: everyMonths,
      };
      if (editing) {
        await remindersApi.update(editing.id, payload);
        notify(
          `Recurring reminder updated — fires on ${firings.length} date${firings.length === 1 ? '' : 's'}.`,
          'success'
        );
      } else {
        // ONE row per recurring template. The backend stores the rule
        // (day-of-month + every-N-months) and evaluates "is it active today?"
        // against it, so the reminders table stays uncluttered.
        await remindersApi.create(payload);
        notify(
          `Recurring reminder saved — fires on ${firings.length} date${firings.length === 1 ? '' : 's'}.`,
          'success'
        );
      }
      onCreated?.();
      onClose();
    } catch (e) {
      if (e?.cancelled) return;
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        background: 'linear-gradient(135deg, #ede7f6 0%, #fff 70%)',
        borderBottom: '1px solid #d1c4e9',
      }}>
        <RepeatIcon sx={{ color: '#673ab7' }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            {editing ? 'Edit Monthly Reminder' : 'Monthly Reminder'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Set once. Fires on the chosen day of every month between the start and end date.
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          <TextField
            label="Reminder name"
            placeholder="e.g. Renew fire certificate, Pay AMC…"
            fullWidth
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />

          {/* Visible to — same UX as the single-reminder dialog */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Visible to
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Chip size="small" label="Admin (always)"
                    sx={{ bgcolor: '#e6f1fb', color: '#0c447c', fontWeight: 600 }} />
              {ROLE_OPTIONS.map((opt) => {
                const on = extraRoles.includes(opt.key);
                return (
                  <Chip
                    key={opt.key}
                    size="small"
                    label={opt.label}
                    onClick={() => setExtra(on
                      ? extraRoles.filter((x) => x !== opt.key)
                      : [...extraRoles, opt.key])}
                    variant={on ? 'filled' : 'outlined'}
                    sx={on
                      ? { bgcolor: '#ede7f6', color: '#4527a0', borderColor: '#b39ddb', fontWeight: 600 }
                      : { borderRadius: 999 }}
                  />
                );
              })}
            </Stack>
          </Box>

          {/* Date range — manual typed entry, no calendar popup */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Start date"
              placeholder="DD/MM/YYYY"
              fullWidth
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              helperText="Type the date, e.g. 01/08/2026"
            />
            <TextField
              label="End date"
              placeholder="DD/MM/YYYY"
              fullWidth
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              helperText="Type the date, e.g. 01/08/2028"
            />
          </Stack>

          {/* Day of month — reminder fires on this day EVERY month between the range */}
          <TextField
            label="Day of every month"
            type="number"
            fullWidth
            value={dayOfMonth}
            onChange={(e) => setDom(e.target.value)}
            inputProps={{ min: 1, max: 31 }}
            helperText="1–31. On this day of every month between the start and end date, the reminder will pop up. Short months auto-clamp — Feb 30 → 28/29."
          />

          {/* Preview strip */}
          <Paper
            variant="outlined"
            sx={{
              p: 1.5, borderRadius: 2,
              borderColor: dateErr ? '#f5c1c1' : '#c8b8ea',
              bgcolor: dateErr ? '#fdf2f2' : '#faf7ff',
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
              <RepeatIcon fontSize="small" sx={{ color: dateErr ? '#a32d2d' : '#673ab7' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {dateErr
                  ? dateErr
                  : `${firings.length} reminder${firings.length === 1 ? '' : 's'} will be created`}
              </Typography>
            </Stack>
            {!dateErr && firings.length > 0 && (
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {firings.slice(0, 24).map((d) => (
                  <Chip
                    key={d.toISOString()}
                    size="small"
                    label={d.format('DD MMM YYYY')}
                    sx={{ bgcolor: '#ede7f6', color: '#4527a0' }}
                  />
                ))}
                {firings.length > 24 && (
                  <Chip size="small" label={`+${firings.length - 24} more`} variant="outlined" />
                )}
              </Stack>
            )}
          </Paper>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          onClick={save}
          variant="contained"
          size="large"
          color="secondary"
          startIcon={<RepeatIcon />}
          disabled={saving || !!dateErr || firings.length === 0 || !text.trim()}
        >
          {saving
            ? <CircularProgress size={20} color="inherit" />
            : editing
              ? 'Save changes'
              : `Create reminder · ${firings.length} firing${firings.length === 1 ? '' : 's'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
