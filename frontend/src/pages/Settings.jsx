import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Stack, Alert, Grid, TextField,
  CircularProgress, Divider,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SaveIcon from '@mui/icons-material/Save';

import api from '../services/api.js';
import { settingsApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Settings() {
  const { user } = useAuth();
  const { notify } = useSnackbar();

  const [form, setForm] = useState({
    clinic_name: '', doctor_name: '', clinic_address: '',
    clinic_phone: '', receipt_footer: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const [logoFile, setLogoFile] = useState(null);
  const [logoVersion, setLogoVersion] = useState(Date.now());
  const [letterpad, setLetterpad] = useState(null);

  useEffect(() => {
    settingsApi.get()
      .then((s) => setForm({ ...form, ...s }))
      .catch((e) => notify(e?.response?.data?.message || 'Failed to load settings', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await settingsApi.update(form);
      notify('Saved', 'success');
    } catch (e) {
      notify(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async () => {
    if (!logoFile) return;
    try {
      await settingsApi.uploadLogo(logoFile);
      notify('Logo uploaded', 'success');
      setLogoFile(null);
      setLogoVersion(Date.now()); // bust cached image
    } catch (e) {
      notify(e?.response?.data?.message || 'Logo upload failed', 'error');
    }
  };

  const uploadLetterpad = async () => {
    if (!letterpad) return;
    const fd = new FormData();
    fd.append('file', letterpad);
    try {
      await api.post('/print/letterpad', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      notify('Letterpad uploaded', 'success');
      setLetterpad(null);
    } catch (e) {
      notify(e?.response?.data?.message || 'Upload failed', 'error');
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Settings</Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>Clinic Info</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Appears on every printed bill and receipt.
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Clinic Name *" fullWidth
                value={form.clinic_name}
                onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Doctor Name *" fullWidth
                value={form.doctor_name}
                onChange={(e) => setForm({ ...form, doctor_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField
                label="Address" fullWidth
                value={form.clinic_address}
                onChange={(e) => setForm({ ...form, clinic_address: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                label="Phone" fullWidth
                value={form.clinic_phone}
                onChange={(e) => setForm({ ...form, clinic_phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Receipt Footer" fullWidth
                placeholder="e.g. Thank you for visiting. Get well soon!"
                value={form.receipt_footer}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={save} variant="contained" startIcon={<SaveIcon />} disabled={saving}>
                {saving ? <CircularProgress size={20} color="inherit" /> : 'Save'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>Clinic Logo</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            PNG or JPEG. Shown on the header of every bill.
          </Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <Box
                sx={{
                  width: '100%', height: 120, border: '1px solid #e0e0e0', borderRadius: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: '#fafafa', overflow: 'hidden',
                }}
              >
                <img
                  src={`/api/settings/logo?v=${logoVersion}`}
                  alt="logo"
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </Box>
            </Grid>
            <Grid item xs={12} sm={9}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                  Choose Image
                  <input hidden type="file" accept="image/png,image/jpeg"
                    onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {logoFile ? logoFile.name : 'No file selected'}
                </Typography>
                <Button variant="contained" onClick={uploadLogo} disabled={!logoFile}>
                  Upload
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {user?.role === 'ADMIN' && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Clinic Letterpad (for prescriptions)</Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                Single-page PDF. Prescription text is overlaid using the configured margins.
              </Alert>
              <Stack direction="row" spacing={2} alignItems="center">
                <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
                  Choose PDF
                  <input hidden type="file" accept="application/pdf"
                    onChange={(e) => setLetterpad(e.target.files?.[0] || null)} />
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {letterpad ? letterpad.name : 'No file selected'}
                </Typography>
                <Button variant="contained" disabled={!letterpad} onClick={uploadLetterpad}>Upload</Button>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Print Margins</Typography>
              <Typography variant="body2" color="text.secondary">
                Letterpad margins are configured in the backend <code>.env</code>:
                <code> PRINT_MARGIN_TOP</code>, <code>PRINT_MARGIN_LEFT</code>,
                <code> PRINT_MARGIN_RIGHT</code>, <code>PRINT_MARGIN_BOTTOM</code>.
                Restart the server after changing them.
              </Typography>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
