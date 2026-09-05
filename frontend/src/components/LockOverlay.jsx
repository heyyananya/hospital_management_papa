import { useState } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button, Avatar, Alert,
  InputAdornment, IconButton, Chip, Stack, CircularProgress
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import KeyIcon from '@mui/icons-material/Key';
import LogoutIcon from '@mui/icons-material/Logout';
import { authApi } from '../services/endpoints.js';

export default function LockOverlay({ user, onUnlock, onLogout }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Invalid Password. Please enter your password.');
      return;
    }
    setError('');
    setSuccess(false);
    setSubmitting(true);
    try {
      // Re-verify password against authentication API
      await authApi.login({ username: user.username, password });
      setSuccess(true);
      setTimeout(() => {
        onUnlock();
      }, 700);
    } catch (err) {
      setError('Invalid Password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(11, 24, 38, 0.85)',
        backdropFilter: 'blur(16px)',
        p: 2,
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <Card
        elevation={24}
        sx={{
          maxWidth: 440,
          width: '100%',
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.15)',
          bgcolor: '#ffffff',
        }}
      >
        {/* Top Header Banner */}
        <Box
          sx={{
            background: 'linear-gradient(135deg, #0b7a4a 0%, #0d527e 100%)',
            color: '#fff',
            p: 3,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          <Avatar
            sx={{
              width: 72,
              height: 72,
              mx: 'auto',
              mb: 1.5,
              bgcolor: '#ffffff',
              color: '#0b7a4a',
              fontWeight: 900,
              fontSize: 28,
              boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
              border: '3px solid rgba(255,255,255,0.85)',
            }}
          >
            {user?.fullName?.charAt(0) || user?.username?.charAt(0) || 'U'}
          </Avatar>
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.3 }}>
            {user?.fullName || user?.username}
          </Typography>
          <Chip
            label={user?.role || 'STAFF'}
            size="small"
            sx={{
              mt: 0.8,
              bgcolor: 'rgba(255,255,255,0.25)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: 1,
            }}
          />
        </Box>

        <CardContent sx={{ p: 4 }}>
          <Stack spacing={2.5}>
            <Box textAlign="center">
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mb: 0.5 }}>
                <LockOutlinedIcon color="primary" fontSize="small" />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b' }}>
                  Session Locked
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Locked due to 5 minutes of inactivity. Enter your password to resume where you left off.
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" variant="filled" sx={{ borderRadius: 2, fontWeight: 600 }}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success" variant="filled" sx={{ borderRadius: 2, fontWeight: 700, bgcolor: '#0b7a4a' }}>
                Successfully Logged In! Resuming session...
              </Alert>
            )}

            <form onSubmit={handleUnlock}>
              <Stack spacing={2}>
                <TextField
                  fullWidth
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  disabled={submitting}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <KeyIcon color="action" fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={submitting}
                  sx={{
                    py: 1.4,
                    borderRadius: 2.5,
                    fontWeight: 800,
                    fontSize: 15,
                    background: 'linear-gradient(135deg, #0b7a4a 0%, #0d527e 100%)',
                    boxShadow: '0 8px 20px rgba(11,122,74,0.35)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #085e39 0%, #093c5d 100%)',
                    },
                  }}
                >
                  {submitting ? <CircularProgress size={24} color="inherit" /> : 'Unlock Session'}
                </Button>
              </Stack>
            </form>

            <Box textAlign="center" pt={1}>
              <Button
                size="small"
                color="secondary"
                startIcon={<LogoutIcon />}
                onClick={onLogout}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Log Out / Switch Account
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
