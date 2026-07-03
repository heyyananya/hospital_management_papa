import { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, CircularProgress, Chip, Divider, Grid,
  Stack, Button, IconButton, Tooltip,
  Table, TableHead, TableRow, TableCell, TableBody,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';

import { patientsApi, printApi } from '../services/endpoints.js';
import { authHeader } from '../services/api.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const Row = ({ label, value }) => (
  <Box sx={{ display: 'flex', gap: 1 }}>
    <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 110 }}>{label}</Typography>
    <Typography variant="body2" sx={{ fontWeight: 500 }}>{value || '—'}</Typography>
  </Box>
);

export default function PatientHistory() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { notify } = useSnackbar();
  const { user } = useAuth();

  useEffect(() => {
    patientsApi.history(id)
      .then(setData)
      .catch((e) => notify(e?.response?.data?.message || 'Failed to load history', 'error'))
      .finally(() => setLoading(false));
  }, [id, notify]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }
  if (!data) return null;

  const { patient, visits } = data;
  const name = [patient.firstName, patient.middleName, patient.surname].filter(Boolean).join(' ');

  const openPdf = (visitId) => {
    // Open through fetch so we can include the JWT header.
    fetch(printApi.prescriptionUrl(visitId), { headers: authHeader() })
      .then((r) => {
        if (!r.ok) throw new Error('Could not load PDF');
        return r.blob();
      })
      .then((b) => {
        const url = URL.createObjectURL(b);
        window.open(url, '_blank');
      })
      .catch((e) => notify(e.message, 'error'));
  };

  return (
    <Box>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="h5">{name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Patient ID <Chip size="small" label={patient.patientCode} sx={{ ml: 0.5 }} />
              </Typography>
              <Stack spacing={0.3}>
                <Row label="Gender"  value={patient.gender} />
                <Row label="Age"     value={patient.age} />
                <Row label="Mobile"  value={patient.mobile} />
                <Row label="Village" value={patient.village} />
                {patient.address && <Row label="Address" value={patient.address} />}
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Stack spacing={0.3}>
                <Row label="Taluka"    value={patient.taluka} />
                <Row label="District"  value={patient.district} />
                <Row label="State"     value={patient.state} />
                <Row label="Allergies" value={patient.allergies} />
                <Row label="Remarks"   value={patient.remarks} />
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ mb: 1 }}>Visits ({visits.length})</Typography>

      {visits.length === 0 && (
        <Card><CardContent><Typography color="text.secondary">No visits yet.</Typography></CardContent></Card>
      )}

      {visits.map((v) => (
        <Card key={v.id} sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Box>
                <Chip size="small" label={`Case #${v.caseNumber}`} sx={{ mr: 1 }} />
                <Chip size="small" label={v.status} color={v.status === 'COMPLETED' ? 'success' : 'warning'} sx={{ mr: 1 }} />
                <Typography variant="body2" component="span" color="text.secondary">
                  {new Date(v.visitDate).toLocaleDateString('en-IN')} · {v.visitTime}
                </Typography>
              </Box>
              {user.role === 'ADMIN' && v.status === 'COMPLETED' && (
                <Tooltip title="Print Prescription">
                  <IconButton onClick={() => openPdf(v.id)}><PrintIcon /></IconButton>
                </Tooltip>
              )}
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="overline" color="text.secondary">Vitals</Typography>
                <Stack spacing={0.3}>
                  <Row label="Weight"      value={v.weight ? `${v.weight} kg` : null} />
                  <Row label="Pulse"       value={v.pulse} />
                  <Row label="BP"          value={(v.bpSystolic || v.bpDiastolic) ? `${v.bpSystolic || '-'}/${v.bpDiastolic || '-'}` : null} />
                  <Row label="SpO2"        value={v.spo2 ? `${v.spo2}%` : null} />
                  <Row label="Complaints"  value={v.complaints} />
                  <Row label="Known"       value={(v.knownDiseases || []).join(', ')} />
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="overline" color="text.secondary">Doctor</Typography>
                <Stack spacing={0.3}>
                  <Row label="Examination" value={(() => {
                    try { return JSON.parse(v.examination || '[]').join(', '); }
                    catch { return ''; }
                  })()} />
                  <Row label="Investigation" value={(() => {
                    try { return JSON.parse(v.investigation || '[]').join(', '); }
                    catch { return ''; }
                  })()} />
                  <Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                      Prescription
                    </Typography>
                    <Box sx={{
                      mt: 0.5, p: 1.2,
                      bgcolor: '#fafafa', border: '1px solid #eee', borderRadius: 1,
                    }}>
                      {(v.medicines && v.medicines.length > 0) ? (
                        <Table size="small" sx={{
                          '& td, & th': { px: 1, py: 0.6, fontSize: 13 },
                        }}>
                          <TableHead>
                            <TableRow>
                              <TableCell width={28}>#</TableCell>
                              <TableCell>Medicine</TableCell>
                              <TableCell align="center" width={70}>Dosage</TableCell>
                              <TableCell align="center" width={90}>Intake</TableCell>
                              <TableCell align="center" width={50}>Days</TableCell>
                              <TableCell align="center" width={50}>Qty</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {v.medicines.map((m, i) => (
                              <TableRow key={i}>
                                <TableCell>{i + 1}</TableCell>
                                <TableCell sx={{ whiteSpace: 'pre-wrap' }}>{m.medicineName}</TableCell>
                                <TableCell align="center">{m.dosage || '—'}</TableCell>
                                <TableCell align="center">{m.intake || '—'}</TableCell>
                                <TableCell align="center">{m.days ?? '—'}</TableCell>
                                <TableCell align="center">{m.qty ?? '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No medicines prescribed.
                        </Typography>
                      )}
                      {v.prescription && (
                        <Box sx={{
                          mt: 1, pt: 1, borderTop: '1px dashed #ddd',
                          whiteSpace: 'pre-wrap', fontSize: 13,
                        }}>
                          <Typography variant="caption" color="text.secondary">Notes</Typography>
                          <div>{v.prescription}</div>
                        </Box>
                      )}
                    </Box>
                  </Box>
                  <Row label="Plan" value={(() => {
                    const raw = v.plan || '';
                    if (!raw) return '';
                    try {
                      const arr = JSON.parse(raw);
                      return Array.isArray(arr) ? arr.join(' • ') : raw;
                    } catch { return raw; }
                  })()} />
                  <Row label="Advice"       value={(v.advices || []).join(' • ')} />
                  <Row label="Follow up"    value={v.followupDate
                    ? `${new Date(v.followupDate).toLocaleDateString('en-IN')}${v.followupNotes ? ' — ' + v.followupNotes : ''}`
                    : null}
                  />
                </Stack>
              </Grid>
              {v.reports?.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="overline" color="text.secondary">Reports</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {v.reports.map((r) => (
                      <Button
                        key={r.id}
                        size="small"
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        component="a"
                        href={`/uploads/reports/${r.storedName}`}
                        target="_blank"
                      >
                        {r.originalName}
                      </Button>
                    ))}
                  </Stack>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      ))}

      <Box sx={{ mt: 2 }}>
        <Button component={RouterLink} to="/patients/search">Back to Search</Button>
      </Box>
    </Box>
  );
}
