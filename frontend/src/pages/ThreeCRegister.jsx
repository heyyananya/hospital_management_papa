/**
 * 3C Register — two views:
 *   • Day-wise: Sr | Date | Amount   (one row per day, total per day)
 *   • Detailed: Sr | Date | Case# | Name | Ref.No | Service | Total | Disc | Net
 *                                    (one row per bill)
 *
 * Letterhead (logo + clinic + doctor) sits on top; signature at the bottom.
 * Both views can be exported to a matching PDF.
 */
import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Stack, Button, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer, CircularProgress,
  ToggleButtonGroup, ToggleButton, Chip, TextField, Tooltip, IconButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import SearchIcon from '@mui/icons-material/Search';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CalendarViewDayIcon from '@mui/icons-material/CalendarViewDay';
import TableChartIcon from '@mui/icons-material/TableChart';

import { registersApi, settingsApi } from '../services/endpoints.js';
import { authHeader } from '../services/api.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { currentFY, prevFY } from '../utils/financialYear.js';

const fmtDate = (d) => (d ? dayjs(d).format('DD/MM/YY') : '');
const money = (n) => Number(n || 0).toFixed(2);

export default function ThreeCRegister() {
  const today = dayjs();
  // Default to the current Financial Year (Apr 1 → today).
  const fy = currentFY();
  const [fromDate, setFromDate] = useState(fy.start);
  const [toDate,   setToDate]   = useState(today.endOf('day'));
  const [mode, setMode] = useState('day'); // 'day' | 'detail'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({ clinic_name: 'FEFSA HOSPITAL', doctor_name: 'Dr. Ajit B. Patel' });
  const { notify } = useSnackbar();

  useEffect(() => {
    settingsApi.get().then(setSettings).catch(() => null);
  }, []);

  // If the mode changes, wipe the previous data so a stale table doesn't flash.
  useEffect(() => { setData(null); }, [mode]);

  const isoFrom = () => fromDate?.format('YYYY-MM-DD');
  const isoTo   = () => toDate?.format('YYYY-MM-DD');

  const load = async () => {
    if (!fromDate || !toDate) return notify('Pick both dates', 'error');
    if (toDate.isBefore(fromDate)) return notify('"To" must be after "From"', 'error');
    setLoading(true);
    try {
      const r = await registersApi.threeC(isoFrom(), isoTo(), mode);
      setData(r);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load register', 'error');
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if (!data) return;
    const r = await fetch(registersApi.threeCPdfUrl(isoFrom(), isoTo(), mode), {
      headers: authHeader(),
    });
    if (!r.ok) return notify('Failed to download PDF', 'error');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  // Inline-edit state for the Amount column (day-wise view).
  // editingDate = ISO date currently being edited; editValue = string in the box.
  const [editingDate, setEditingDate] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [savingDate, setSavingDate] = useState(null);

  const beginEdit = (row) => {
    setEditingDate(row.date);
    setEditValue(String(row.amount ?? 0));
  };
  const cancelEdit = () => {
    setEditingDate(null);
    setEditValue('');
  };
  // Persists the override to the DB and merges the result back into state so
  // the totals row updates without a round-trip refetch.
  const commitEdit = async (row) => {
    if (editingDate == null) return;
    const trimmed = String(editValue).trim();
    const isClear = trimmed === '';
    const parsed  = isClear ? null : Number(trimmed);
    if (!isClear && (!Number.isFinite(parsed) || parsed < 0)) {
      notify('Enter a valid non-negative amount', 'error');
      return;
    }
    // No-op if unchanged and it's not a clear.
    if (!isClear && parsed === Number(row.amount)) { cancelEdit(); return; }
    setSavingDate(row.date);
    try {
      const res = await registersApi.setThreeCAmount(row.date, parsed);
      // Update this row + recompute summary.amount from displayed values.
      setData((prev) => {
        if (!prev) return prev;
        const nextRows = prev.rows.map((r) => {
          if (r.date !== row.date) return r;
          const newAmount = res.amount == null ? Number(r.computedAmount ?? r.amount) : Number(res.amount);
          return {
            ...r,
            amount: newAmount,
            overrideAmount: res.amount == null ? null : Number(res.amount),
            edited: res.amount != null,
          };
        });
        const nextSum = nextRows.reduce((s, r) => s + Number(r.amount || 0), 0);
        return {
          ...prev,
          rows: nextRows,
          summary: { ...prev.summary, amount: nextSum },
        };
      });
      notify(res.amount == null ? 'Amount reset to computed total' : 'Amount saved', 'success');
      cancelEdit();
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to save amount', 'error');
    } finally {
      setSavingDate(null);
    }
  };
  // "Reset" clears the override so the row falls back to the computed sum.
  const resetOverride = async (row) => {
    setSavingDate(row.date);
    try {
      const res = await registersApi.setThreeCAmount(row.date, null);
      setData((prev) => {
        if (!prev) return prev;
        const nextRows = prev.rows.map((r) =>
          r.date === row.date
            ? { ...r, amount: Number(r.computedAmount ?? r.amount), overrideAmount: null, edited: false }
            : r
        );
        const nextSum = nextRows.reduce((s, r) => s + Number(r.amount || 0), 0);
        return { ...prev, rows: nextRows, summary: { ...prev.summary, amount: nextSum } };
      });
      notify('Reset to computed total', 'success');
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to reset', 'error');
    } finally {
      setSavingDate(null);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>3C Register OPD</Typography>

      {/* Filter + mode bar */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <DatePicker
              label="From"
              value={fromDate}
              onChange={setFromDate}
              format="DD/MM/YYYY"
              slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
            />
            <DatePicker
              label="To"
              value={toDate}
              onChange={setToDate}
              format="DD/MM/YYYY"
              minDate={fromDate || undefined}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
            />
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                label={`This FY (${currentFY().label.replace('FY ', '')})`}
                onClick={() => {
                  const f = currentFY();
                  setFromDate(f.start);
                  setToDate(dayjs().endOf('day').isBefore(f.end) ? dayjs().endOf('day') : f.end);
                }}
                variant="outlined"
                sx={{ borderRadius: 999 }}
              />
              <Chip
                size="small"
                label={`Last FY (${prevFY().label.replace('FY ', '')})`}
                onClick={() => {
                  const f = prevFY();
                  setFromDate(f.start);
                  setToDate(f.end);
                }}
                variant="outlined"
                sx={{ borderRadius: 999 }}
              />
              <Chip
                size="small"
                label="This month"
                onClick={() => {
                  setFromDate(dayjs().startOf('month'));
                  setToDate(dayjs().endOf('day'));
                }}
                variant="outlined"
                sx={{ borderRadius: 999 }}
              />
              <Chip
                size="small"
                label="Today"
                onClick={() => {
                  setFromDate(dayjs().startOf('day'));
                  setToDate(dayjs().endOf('day'));
                }}
                variant="outlined"
                sx={{ borderRadius: 999 }}
              />
            </Stack>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={mode}
              onChange={(_, v) => v && setMode(v)}
              sx={{
                '& .MuiToggleButton-root': { textTransform: 'none', px: 2 },
                '& .Mui-selected': { bgcolor: '#e6f1fb !important', color: '#0c447c' },
              }}
            >
              <ToggleButton value="day">
                <CalendarViewDayIcon fontSize="small" sx={{ mr: 0.75 }} />
                Date Wise
              </ToggleButton>
              <ToggleButton value="detail">
                <TableChartIcon fontSize="small" sx={{ mr: 0.75 }} />
                Detailed
              </ToggleButton>
            </ToggleButtonGroup>
            <Button onClick={load} variant="contained" startIcon={<SearchIcon />}>Show</Button>
            <Button
              onClick={downloadPdf}
              variant="outlined"
              startIcon={<PictureAsPdfIcon />}
              disabled={!data}
            >
              Download PDF
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Register sheet */}
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {/* Letterhead */}
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{ pb: 2, borderBottom: '2px solid #0d527e' }}
          >
            <Box
              component="img"
              src={settingsApi.logoUrl()}
              alt="Logo"
              sx={{ height: 64, width: 64, objectFit: 'contain', borderRadius: 1, bgcolor: '#fff' }}
              onError={(e) => { e.target.style.visibility = 'hidden'; }}
            />
            <Box sx={{ flex: 1, textAlign: 'center' }}>
              <Typography
                variant="h5"
                sx={{ fontWeight: 800, letterSpacing: 1, color: '#0d527e', textTransform: 'uppercase' }}
              >
                {settings.clinic_name || 'FEFSA HOSPITAL'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Chest Physician
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right', minWidth: 160 }}>
              <Typography sx={{ fontWeight: 700 }}>
                {settings.doctor_name || 'Dr. Ajit B. Patel'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                MB., DTCD. (Chest)
              </Typography>
            </Box>
          </Stack>

          {/* Title row */}
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 2, mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              3C Register OPD — {mode === 'detail' ? 'Detailed' : 'Date Wise'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {fmtDate(fromDate)} &nbsp; to &nbsp; {fmtDate(toDate)}
            </Typography>
          </Stack>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : !data ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              Pick a date range and press <strong>Show</strong> to load the register.
            </Box>
          ) : mode === 'day' ? (
            // ── DAY-WISE VIEW ──────────────────────────────────
            <TableContainer sx={{ border: '1px solid #d9dde3', borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#eef2f8' }}>
                    <TableCell width={120} align="center" sx={{ fontWeight: 700 }}>Sr. No.</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell width={260} align="right" sx={{ fontWeight: 700, pr: 3 }}>Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.map((r) => {
                    const isEditing = editingDate === r.date;
                    const isSaving  = savingDate  === r.date;
                    return (
                      <TableRow key={r.date} hover>
                        <TableCell align="center">{r.srNo}</TableCell>
                        <TableCell align="center">{fmtDate(r.date)}</TableCell>
                        <TableCell align="right" sx={{ pr: 1.5 }}>
                          {isEditing ? (
                            <Stack direction="row" spacing={0.75} justifyContent="flex-end" alignItems="center">
                              <TextField
                                size="small"
                                type="number"
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitEdit(r);
                                  else if (e.key === 'Escape') cancelEdit();
                                }}
                                inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }}
                                sx={{ width: 140 }}
                                disabled={isSaving}
                              />
                              <Button
                                size="small"
                                variant="contained"
                                onClick={() => commitEdit(r)}
                                disabled={isSaving}
                              >
                                {isSaving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
                              </Button>
                              <Button size="small" onClick={cancelEdit} disabled={isSaving}>
                                Cancel
                              </Button>
                            </Stack>
                          ) : (
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                              <Typography component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                {money(r.amount)}
                              </Typography>
                              {r.edited && (
                                <Tooltip title="Manually edited — click reset to revert to the computed total">
                                  <Chip
                                    size="small"
                                    label="edited"
                                    sx={{
                                      height: 18, fontSize: 10, fontWeight: 700,
                                      bgcolor: '#fff4d6', color: '#8a5a00',
                                      border: '1px solid #f0c453',
                                    }}
                                  />
                                </Tooltip>
                              )}
                              <Tooltip title="Edit amount">
                                <IconButton size="small" onClick={() => beginEdit(r)} disabled={isSaving}>
                                  <EditIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                              {r.edited && (
                                <Tooltip title="Reset to computed total">
                                  <IconButton size="small" onClick={() => resetOverride(r)} disabled={isSaving}>
                                    <RestartAltIcon fontSize="inherit" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {data.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        No bills in this date range.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.rows.length > 0 && (
                    <TableRow sx={{ bgcolor: '#f8fafd', '& td': { fontWeight: 700 } }}>
                      <TableCell colSpan={2} align="right">Total</TableCell>
                      <TableCell align="right" sx={{ pr: 3 }}>{money(data.summary.amount)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            // ── DETAILED VIEW ───────────────────────────────────
            <TableContainer sx={{ border: '1px solid #d9dde3', borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#eef2f8' }}>
                    <TableCell width={40}  align="center" sx={{ fontWeight: 700 }}>Sr.</TableCell>
                    <TableCell width={80}  align="center" sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell width={90}  align="center" sx={{ fontWeight: 700 }}>Case #</TableCell>
                    <TableCell                             sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell width={120} align="center" sx={{ fontWeight: 700 }}>Ref. No.</TableCell>
                    <TableCell width={130}                sx={{ fontWeight: 700 }}>Service</TableCell>
                    <TableCell width={80}  align="right"  sx={{ fontWeight: 700 }}>Total</TableCell>
                    <TableCell width={70}  align="right"  sx={{ fontWeight: 700 }}>Disc.</TableCell>
                    <TableCell width={80}  align="right"  sx={{ fontWeight: 700, pr: 2 }}>Net</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell align="center">{r.srNo}</TableCell>
                      <TableCell align="center">{fmtDate(r.visitDate)}</TableCell>
                      <TableCell align="center">{r.patientCode}</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{r.name}</TableCell>
                      <TableCell align="center">{r.billNumber}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{r.service}</TableCell>
                      <TableCell align="right">{money(r.total)}</TableCell>
                      <TableCell align="right">{money(r.discount)}</TableCell>
                      <TableCell align="right" sx={{ pr: 2 }}>{money(r.net)}</TableCell>
                    </TableRow>
                  ))}
                  {data.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        No bills in this date range.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.rows.length > 0 && (
                    <TableRow sx={{ bgcolor: '#f8fafd', '& td': { fontWeight: 700 } }}>
                      <TableCell colSpan={5} align="right">Totals</TableCell>
                      <TableCell>{data.summary.count} bills</TableCell>
                      <TableCell align="right">{money(data.summary.total)}</TableCell>
                      <TableCell align="right">{money(data.summary.discount)}</TableCell>
                      <TableCell align="right" sx={{ pr: 2 }}>{money(data.summary.net)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Signature */}
          <Box sx={{ mt: 6, textAlign: 'right', pr: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>
              {settings.doctor_name || 'Dr. Ajit B. Patel'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Chest Physician
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
