/**
 * Global search — sits in the AppBar and jumps to any page or patient in
 * one shot. Type a few letters and:
 *   - Every sidebar page whose label matches surfaces first (permission-gated
 *     the same way as the sidebar, so an MO doesn't see admin-only pages).
 *   - Then any patient matching name / UHID / mobile — fetched live from
 *     the server, debounced at ~250ms.
 *
 * Selecting a page → navigate to its path.
 * Selecting a patient → open their history page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete, TextField, InputAdornment, Chip, Box, Typography, Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonIcon from '@mui/icons-material/Person';
import { useNavigate } from 'react-router-dom';

import { PERMISSIONS, effectivePermissions } from '../utils/permissions.js';
import { patientsApi } from '../services/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

// One list of possible options: pages (static, permission-filtered) +
// patients (live, refreshed as the query changes).
export default function GlobalSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const debounceRef = useRef(null);

  const grantedPages = useMemo(() => {
    const granted = new Set(effectivePermissions(user));
    return PERMISSIONS
      .filter((p) => granted.has(p.key))
      .map((p) => ({
        kind: 'page',
        id: `page:${p.key}`,
        label: p.label,
        group: p.group || 'Pages',
        path: p.path,
      }));
  }, [user]);

  // Debounced patient search — server-side, so leaves out inactive patients
  // and respects the same rules as the Patients page.
  useEffect(() => {
    const q = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setPatients([]); return; }
    setLoadingPatients(true);
    debounceRef.current = setTimeout(async () => {
      try {
        // Guess the type of input: pure digits → patient code or mobile; else name.
        const params = {};
        const digits = q.replace(/\D/g, '');
        if (/^\d{1,5}$/.test(q))         params.patientCode = digits;
        else if (/^\d{6,}$/.test(digits)) params.mobile = digits;
        else                              params.name = q;
        const rows = await patientsApi.search({ ...params, limit: 10 });
        setPatients(rows.map((p) => ({
          kind: 'patient',
          id: `pt:${p.id}`,
          label: `${[p.firstName, p.middleName, p.surname].filter(Boolean).join(' ')} — ${p.patientCode}`,
          group: 'Patients',
          patient: p,
        })));
      } catch {
        setPatients([]);
      } finally {
        setLoadingPatients(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const options = useMemo(() => [...grantedPages, ...patients], [grantedPages, patients]);

  const onPick = (_, value) => {
    if (!value || typeof value === 'string') return;
    if (value.kind === 'page')    navigate(value.path);
    if (value.kind === 'patient') navigate(`/patients/${value.patient.id}/history`);
    // Clear the box after navigation so the next search starts fresh.
    setQuery('');
  };

  return (
    <Autocomplete
      freeSolo
      size="small"
      options={options}
      groupBy={(o) => o.group}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o?.label || '')}
      isOptionEqualToValue={(a, b) => a?.id === b?.id}
      loading={loadingPatients}
      onInputChange={(_, v) => setQuery(v)}
      onChange={onPick}
      filterOptions={(list, s) => {
        // Custom client-side filter for the PAGE entries so short queries
        // like "a" surface everything containing an "a". Patient results
        // are already server-filtered — pass them through untouched.
        const q = (s.inputValue || '').trim().toLowerCase();
        if (!q) return list;
        return list.filter((o) =>
          o.kind === 'patient'
            ? true
            : `${o.label} ${o.group}`.toLowerCase().includes(q)
        );
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} sx={{ py: 0.75 }}>
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ width: '100%' }}>
            {option.kind === 'patient'
              ? <PersonIcon fontSize="small" sx={{ color: 'primary.main' }} />
              : <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{option.label}</Typography>
              {option.kind === 'page' && option.path && (
                <Typography variant="caption" color="text.secondary">{option.path}</Typography>
              )}
              {option.kind === 'patient' && option.patient && (
                <Typography variant="caption" color="text.secondary">
                  {option.patient.mobile} · {option.patient.village || '—'}
                </Typography>
              )}
            </Box>
            <Chip
              size="small"
              label={option.kind === 'page' ? 'Page' : 'Patient'}
              variant="outlined"
              color={option.kind === 'page' ? 'default' : 'primary'}
            />
          </Stack>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Search pages, patients (name / UHID / mobile)…"
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      )}
      sx={{
        width: { xs: 220, sm: 320, md: 380 },
        mr: 1.5,
        bgcolor: 'background.paper',
        borderRadius: 1,
      }}
    />
  );
}
