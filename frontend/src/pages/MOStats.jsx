import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Grid, TextField, Button, Stack, Typography,
  Table, TableHead, TableRow, TableCell, TableContainer, TableBody, CircularProgress,
  MenuItem,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';

import { moApi, usersApi } from '../services/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import FyRangeChips from '../components/FyRangeChips.jsx';
import { currentFY } from '../utils/financialYear.js';

/**
 * Patients-attended report.
 *
 * - Admins see one row per Medical Officer with a count, and may pick a
 *   single MO from the dropdown to drill down.
 * - Medical Officers see only their own number (the backend pins moId to
 *   their user id, regardless of any value sent), so the page reduces to a
 *   single headline: "You have attended N patients between A and B."
 */
export default function MOStats() {
  const { user } = useAuth();
  const isMO = user?.role === 'MEDICAL_OFFICER';

  const today = dayjs();
  const fy = currentFY();
  const [filters, setFilters] = useState({
    fromDate: fy.start,
    toDate: today,
    moId: '',
  });
  const [users, setUsers] = useState([]);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const { notify } = useSnackbar();

  const load = async (next = filters) => {
    setLoading(true);
    try {
      const params = {};
      if (next.fromDate) params.fromDate = dayjs(next.fromDate).format('YYYY-MM-DD');
      if (next.toDate)   params.toDate   = dayjs(next.toDate).format('YYYY-MM-DD');
      if (!isMO && next.moId) params.moId = next.moId;
      const r = await moApi.stats(params);
      setData(r);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isMO) {
      usersApi.list()
        .then((list) => setUsers(list.filter((u) => u.role === 'MEDICAL_OFFICER' || u.role === 'ADMIN')))
        .catch(() => {});
    }
    load(filters); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rangeLabel = `${dayjs(filters.fromDate).format('DD MMM YYYY')} – ${dayjs(filters.toDate).format('DD MMM YYYY')}`;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {isMO ? 'My Attended Patients' : 'Patients Attended by MO'}
      </Typography>

      {/* ---- Simple filter row ---- */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={6} sm={3}>
              <DatePicker
                label="From"
                value={filters.fromDate}
                onChange={(d) => setFilters({ ...filters, fromDate: d })}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <DatePicker
                label="To"
                value={filters.toDate}
                onChange={(d) => setFilters({ ...filters, toDate: d })}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            {!isMO && (
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Medical Officer"
                  select
                  fullWidth
                  value={filters.moId}
                  onChange={(e) => setFilters({ ...filters, moId: e.target.value })}
                >
                  <MenuItem value="">All</MenuItem>
                  {users.map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.fullName || u.username}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid item xs={12} sm={isMO ? 6 : 2}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={() => load(filters)}
              >
                Apply
              </Button>
            </Grid>
            <Grid item xs={12}>
              <FyRangeChips onPick={(from, to) =>
                setFilters((f) => ({ ...f, fromDate: from, toDate: to }))} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ---- Result ---- */}
      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : isMO ? (
            // --- MO view: a single headline number ---
            <Stack alignItems="center" sx={{ py: 4 }} spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Patients attended between
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                {rangeLabel}
              </Typography>
              <Typography variant="h2" sx={{ fontWeight: 700, color: 'primary.main', mt: 1 }}>
                {data.total}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {data.total === 1 ? 'patient' : 'patients'}
              </Typography>
            </Stack>
          ) : (
            // --- Admin view: simple per-MO table ---
            <>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {rangeLabel}
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  Total: {data.total}
                </Typography>
              </Stack>
              <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Medical Officer</TableCell>
                    <TableCell align="right">Patients Attended</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Typography color="text.secondary">No data for the selected range.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {data.rows.map((r) => (
                    <TableRow key={r.moId} hover>
                      <TableCell>{r.moName}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {r.attendedCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              
              </Table>
              </TableContainer>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
