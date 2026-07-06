import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Grid, TextField, Button, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Chip, Typography, CircularProgress,
  TablePagination, Stack, Tabs, Tab,
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

export default function AutoBills() {
  const [tab, setTab] = useState('OPD');

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">
            Auto Generated Bills — {tab === 'OPD' ? 'OPD Bills' : 'IPD Bills'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tab === 'OPD'
              ? <>Standard <b>OPD bill</b> (New Case ₹400 / Old Case ₹200) — generated automatically at every visit.
                  If a patient asks for a custom amount, open the bill and click <b>Edit</b> to change the price.</>
              : <><b>IPD bills</b> for indoor patients. Create one from <b>IPD Patients</b> or <b>Discharged Patients</b>
                  by clicking <b>Make a Bill</b>, then add the services and charges manually.</>}
          </Typography>
        </Box>
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="OPD" label="OPD Bills" />
        <Tab value="IPD" label="IPD Bills" />
      </Tabs>

      {/* Mount-once-per-tab so filter state and page position reset when the
          reception switches views. */}
      {tab === 'OPD' && <BillListPanel key="opd" kind="OPD" />}
      {tab === 'IPD' && <BillListPanel key="ipd" kind="IPD" />}
    </Box>
  );
}

function BillListPanel({ kind }) {
  const isIpd = kind === 'IPD';
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
      const r = isIpd ? await billsApi.listIpd(params) : await billsApi.listAuto(params);
      setData(r);
    } catch (e) {
      notify(e?.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1, data.pageSize); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={5}>
              <TextField
                label={isIpd
                  ? 'Search (bill #, patient name, mobile, UHID)'
                  : 'Search (bill #, patient name, mobile, UHID)'}
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
              <Table size="small" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Bill No</TableCell>
                    <TableCell>Patient</TableCell>
                    <TableCell>UHID</TableCell>
                    <TableCell>Mobile</TableCell>
                    <TableCell>{isIpd ? 'Adm #' : 'Case'}</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <Typography color="text.secondary">
                          {isIpd
                            ? 'No IPD bills yet. Click Make a Bill on an admitted or discharged patient to create one.'
                            : 'No bills found.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {data.rows.map((b) => (
                    <TableRow key={b.id} hover>
                      <TableCell><Chip size="small" label={b.billNumber} color={isIpd ? 'warning' : 'primary'} variant="outlined" /></TableCell>
                      <TableCell>{b.patientName}</TableCell>
                      <TableCell>{b.patientCode}</TableCell>
                      <TableCell>{b.mobile}</TableCell>
                      <TableCell>
                        {isIpd ? (
                          b.admissionFyKey
                            ? <Chip size="small" color="warning" variant="outlined"
                                    label={`${b.admissionFyKey}/${b.admissionNumber}`} />
                            : '—'
                        ) : (
                          <Chip size="small"
                            color={b.caseType === 'NEW' ? 'primary' : 'default'}
                            label={b.caseType === 'NEW' ? 'New' : 'Old'} />
                        )}
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
    </>
  );
}
