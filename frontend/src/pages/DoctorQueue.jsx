import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Table, TableHead, TableRow,
  TableCell, TableContainer, TableBody, Button, Chip, CircularProgress,
  TextField, InputAdornment, IconButton, Stack,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import HotelIcon from '@mui/icons-material/Hotel';

import { doctorApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

export default function DoctorQueue() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const { notify } = useSnackbar();
  const navigate = useNavigate();

  // Client-side filter across every visible field so the doctor can type
  // any fragment (case #, patient ID, name, mobile, village) and land on
  // the right row instantly.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.caseNumber, r.patientCode, r.patientName, r.mobile,
        r.village, r.gender,
      ].filter(Boolean).map((v) => String(v).toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }, [rows, query]);

  const load = () => {
    setLoading(true);
    doctorApi.queue()
      .then(setRows)
      .catch((e) => notify(e?.response?.data?.message || 'Failed to load queue', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Doctor Queue</Typography>
        <Button onClick={load} startIcon={<RefreshIcon />} variant="outlined">Refresh</Button>
      </Box>
      <Card>
        <CardContent>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by case #, patient ID, name, mobile or village…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setQuery('')} aria-label="Clear search">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : rows.length === 0 ? (
            <Typography color="text.secondary">No patients waiting.</Typography>
          ) : filtered.length === 0 ? (
            <Typography color="text.secondary">
              No matches for "{query}". {rows.length} patient{rows.length === 1 ? '' : 's'} in queue.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Case #</TableCell>
                  <TableCell>Patient ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Gender</TableCell>
                  <TableCell>Village</TableCell>
                  <TableCell>Mobile</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell><Chip size="small" color="primary" label={r.caseNumber} /></TableCell>
                    <TableCell>{r.patientCode}</TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                        <span>{r.patientName}</span>
                        {r.isAdmitted && (
                          <Chip
                            size="small" color="warning" icon={<HotelIcon />}
                            label="Admitted"
                            sx={{ fontWeight: 600, height: 22 }}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{r.gender}</TableCell>
                    <TableCell>{r.village}</TableCell>
                    <TableCell>{r.mobile}</TableCell>
                    <TableCell>{r.visitTime}</TableCell>
                    <TableCell align="right">
                      <Button
                        variant="contained" size="small"
                        onClick={() => navigate(`/doctor/visit/${r.id}`)}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            
              </Table>
              </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
