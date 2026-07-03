import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Grid, TextField, Button, Table, TableHead, TableRow,
  TableCell, TableContainer, TableBody, Chip, Typography, CircularProgress, TablePagination, Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Link as RouterLink } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';

import { billsApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import FyRangeChips from '../components/FyRangeChips.jsx';
import { currentFY } from '../utils/financialYear.js';

const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;

export default function FinalBills() {
  const fy = currentFY();
  const [filters, setFilters] = useState({ q: '', fromDate: fy.start, toDate: dayjs().endOf('day') });
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(false);
  const { notify } = useSnackbar();

  const load = async (page = data.page, pageSize = data.pageSize) => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (filters.q) params.q = filters.q;
      if (filters.fromDate) params.fromDate = dayjs(filters.fromDate).format('YYYY-MM-DD');
      if (filters.toDate)   params.toDate   = dayjs(filters.toDate).format('YYYY-MM-DD');
      const r = await billsApi.listFinal(params);
      setData(r);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1, data.pageSize); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">Final / Edited Bills</Typography>
          <Typography variant="body2" color="text.secondary">
            Official bills given to patients on request. Created from an Auto bill.
          </Typography>
        </Box>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={5}>
              <TextField
                label="Search (bill #, patient name, mobile, UHID)"
                fullWidth
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && load(1, data.pageSize)}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <DatePicker label="From" value={filters.fromDate}
                onChange={(d) => setFilters({ ...filters, fromDate: d })}
                slotProps={{ textField: { fullWidth: true } }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <DatePicker label="To" value={filters.toDate}
                onChange={(d) => setFilters({ ...filters, toDate: d })}
                slotProps={{ textField: { fullWidth: true } }} />
            </Grid>
            <Grid item xs={12} sm={1}>
              <Button fullWidth variant="contained" startIcon={<SearchIcon />}
                onClick={() => load(1, data.pageSize)}>Go</Button>
            </Grid>
            <Grid item xs={12}>
              <FyRangeChips onPick={(from, to) =>
                setFilters((f) => ({ ...f, fromDate: from, toDate: to }))} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : (
            <>
              <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Bill No</TableCell>
                    <TableCell>Patient</TableCell>
                    <TableCell>UHID</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography color="text.secondary">No final bills yet.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {data.rows.map((b) => (
                    <TableRow key={b.id} hover>
                      <TableCell><Chip size="small" label={b.billNumber} color="secondary" variant="outlined" /></TableCell>
                      <TableCell>{b.patientName}</TableCell>
                      <TableCell>{b.patientCode}</TableCell>
                      <TableCell>
                        <Chip size="small" color={b.status === 'LOCKED' ? 'success' : 'warning'} label={b.status} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{money(b.total)}</TableCell>
                      <TableCell>{new Date(b.createdAt).toLocaleString('en-IN')}</TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          startIcon={<VisibilityIcon />}
                          component={RouterLink}
                          to={`/bills/${b.id}`}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              
              </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={data.total}
                page={data.page - 1}
                onPageChange={(_, p) => load(p + 1, data.pageSize)}
                rowsPerPage={data.pageSize}
                onRowsPerPageChange={(e) => load(1, parseInt(e.target.value, 10))}
                rowsPerPageOptions={[10, 25, 50, 100]}
              />
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
