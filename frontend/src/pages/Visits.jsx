import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Grid, TextField, Button, MenuItem, Table, TableHead,
  TableRow, TableCell, TableContainer, TableBody, Chip, Typography, CircularProgress, TablePagination,
  Stack,
} from '@mui/material';
import HotelIcon from '@mui/icons-material/Hotel';
import SearchIcon from '@mui/icons-material/Search';
import { Link as RouterLink } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';

import { visitsApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import FyRangeChips from '../components/FyRangeChips.jsx';
import { currentFY } from '../utils/financialYear.js';

const STATUSES = [
  '', 'WAITING_FOR_MEDICAL_OFFICER', 'WAITING_FOR_DOCTOR', 'COMPLETED', 'CANCELLED', 'NO_SHOW',
];

export default function Visits() {
  const fy = currentFY();
  const [filters, setFilters] = useState({
    patientCode: '', caseNumber: '', name: '', mobile: '', village: '',
    fromDate: fy.start, toDate: dayjs().endOf('day'), status: '',
  });
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(false);
  const { notify } = useSnackbar();

  const load = async (page = data.page, pageSize = data.pageSize) => {
    setLoading(true);
    try {
      const params = { ...filters, page, pageSize };
      Object.keys(params).forEach((k) => (params[k] === '' || params[k] == null) && delete params[k]);
      if (params.fromDate) params.fromDate = dayjs(params.fromDate).format('YYYY-MM-DD');
      if (params.toDate)   params.toDate   = dayjs(params.toDate).format('YYYY-MM-DD');
      const r = await visitsApi.search(params);
      setData(r);
    } catch (e) {
      notify(e?.response?.data?.message || 'Search failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1, data.pageSize); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Visits</Typography>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}><TextField label="Patient ID" fullWidth value={filters.patientCode}
              onChange={(e) => setFilters({ ...filters, patientCode: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField label="Case #" fullWidth value={filters.caseNumber}
              onChange={(e) => setFilters({ ...filters, caseNumber: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField label="Name" fullWidth value={filters.name}
              onChange={(e) => setFilters({ ...filters, name: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField label="Mobile" fullWidth value={filters.mobile}
              onChange={(e) => setFilters({ ...filters, mobile: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}><TextField label="Village" fullWidth value={filters.village}
              onChange={(e) => setFilters({ ...filters, village: e.target.value })} /></Grid>
            <Grid item xs={6} sm={3}>
              <DatePicker label="From" value={filters.fromDate} onChange={(d) => setFilters({ ...filters, fromDate: d })}
                slotProps={{ textField: { fullWidth: true } }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <DatePicker label="To" value={filters.toDate} onChange={(d) => setFilters({ ...filters, toDate: d })}
                slotProps={{ textField: { fullWidth: true } }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField select label="Status" fullWidth value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                {STATUSES.map((s) => <MenuItem key={s} value={s}>{s || 'Any'}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <FyRangeChips onPick={(from, to) =>
                setFilters((f) => ({ ...f, fromDate: from, toDate: to }))} />
            </Grid>
            <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" startIcon={<SearchIcon />} onClick={() => load(1, data.pageSize)}>Search</Button>
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
                    <TableCell>Case #</TableCell>
                    <TableCell>Patient ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Village</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.map((v) => (
                    <TableRow key={v.id} hover>
                      <TableCell><Chip size="small" label={v.caseNumber} /></TableCell>
                      <TableCell>{v.patientCode}</TableCell>
                      <TableCell>{v.patientName}</TableCell>
                      <TableCell>{v.village}</TableCell>
                      <TableCell>{new Date(v.visitDate).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Chip size="small" label={v.status}
                            color={v.status === 'COMPLETED' ? 'success' : v.status === 'CANCELLED' ? 'default' : 'warning'} />
                          {v.isAdmitted && (
                            <Chip size="small" color="warning" icon={<HotelIcon />} label="Admitted"
                              sx={{ fontWeight: 600 }} />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Button component={RouterLink} to={`/patients/${v.patientId}/history`} size="small">
                          History
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
