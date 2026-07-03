import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Navigate } from 'react-router-dom';
import { keyframes } from '@emotion/react';
import {
  Box, Paper, Typography, TextField, Button, CircularProgress, Alert,
  InputAdornment, IconButton, Stack,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';

import { useAuth } from '../context/AuthContext.jsx';
import { settingsApi } from '../services/endpoints.js';

/* ============================ animations ============================ */
const gradientShift = keyframes`
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;
const float = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(40px, -50px) scale(1.08); }
  66%      { transform: translate(-30px, 40px) scale(0.94); }
`;
const floatReverse = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  33%      { transform: translate(-50px, 30px) scale(1.1); }
  66%      { transform: translate(40px, -40px) scale(0.92); }
`;
const breathe = keyframes`
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.55); }
  50%      { transform: scale(1.06); box-shadow: 0 0 0 22px rgba(255,255,255,0); }
`;
const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const slideInLeft = keyframes`
  from { opacity: 0; transform: translateX(-40px); }
  to   { opacity: 1; transform: translateX(0); }
`;
const slideInRight = keyframes`
  from { opacity: 0; transform: translateX(40px); }
  to   { opacity: 1; transform: translateX(0); }
`;
const shimmer = keyframes`
  0%   { background-position: 200% 50%; }
  100% { background-position: -200% 50%; }
`;
const sparkleDrift = keyframes`
  0%   { transform: translateY(0)   rotate(0deg);   opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { transform: translateY(-120vh) rotate(360deg); opacity: 0; }
`;
// Slow rotating conic-gradient border around the entire login card.
const spinBorder = keyframes`
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;
// Reveals each letter of "FEFSA HOSPITAL" with a soft upward slide.
const letterReveal = keyframes`
  0%   { opacity: 0; transform: translateY(20px) scale(0.85); filter: blur(6px); }
  60%  { opacity: 1; filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
`;
// Slow horizontal wave drift for the SVG curves under the brand text.
const waveDrift = keyframes`
  0%   { transform: translate3d(0,   0, 0); }
  100% { transform: translate3d(-50%, 0, 0); }
`;
// Brand pulse for the Sign In button glow.
const glowPulse = keyframes`
  0%, 100% { box-shadow: 0 14px 32px -10px rgba(11,122,74,0.55),
                        0 10px 24px -10px rgba(75,63,179,0.45),
                        0 0 0 0 rgba(11,122,74,0); }
  50%      { box-shadow: 0 14px 32px -10px rgba(11,122,74,0.55),
                        0 10px 24px -10px rgba(75,63,179,0.45),
                        0 0 0 12px rgba(11,122,74,0.08); }
`;

/* ============================== features ============================ */
const FEATURES = [
  {
    icon: <LocalHospitalOutlinedIcon />,
    title: 'OPD & Visit Tracking',
    desc:  'Register, queue, and consult patients in one flow.',
  },
  {
    icon: <ReceiptLongOutlinedIcon />,
    title: 'Auto Bills & Receipts',
    desc:  'Print FEFSA bills the moment a visit is created.',
  },
  {
    icon: <AssignmentIndOutlinedIcon />,
    title: 'Digital Prescriptions',
    desc:  'Clean A4 letterpad output, signature optional.',
  },
  {
    icon: <HistoryEduOutlinedIcon />,
    title: 'Patient History',
    desc:  'Every visit, vital, and report at your fingertips.',
  },
];

function FeatureCard({ icon, title, desc, delay }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.75,
        p: 1.75,
        borderRadius: 3,
        bgcolor: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.18)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        opacity: 0,
        animation: `${fadeUp} 0.7s cubic-bezier(.2,.7,.2,1) ${delay}s forwards`,
        transition: 'transform .35s ease, background-color .35s ease, border-color .35s ease, box-shadow .35s ease',
        cursor: 'default',
        '&:hover': {
          transform: 'translateX(6px) translateY(-2px)',
          bgcolor: 'rgba(255,255,255,0.20)',
          borderColor: 'rgba(255,255,255,0.45)',
          boxShadow: '0 16px 30px -16px rgba(0,0,0,0.45)',
        },
        '&:hover .featIcon': {
          transform: 'rotate(-8deg) scale(1.1)',
          background: 'rgba(255,255,255,0.30)',
        },
      }}
    >
      <Box
        className="featIcon"
        sx={{
          width: 42, height: 42, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.22)',
          color: '#fff',
          transition: 'transform .35s cubic-bezier(.2,.7,.2,1), background-color .35s ease',
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{title}</Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.82)' }}>{desc}</Typography>
      </Box>
    </Box>
  );
}

/* --------- letter-by-letter reveal for "FEFSA HOSPITAL" -------------- */
function RevealText({ text, sx }) {
  return (
    <Typography component="span" sx={{ display: 'inline-flex', flexWrap: 'wrap', ...sx }}>
      {text.split('').map((ch, i) => (
        <Box
          key={i}
          component="span"
          sx={{
            display: 'inline-block',
            whiteSpace: 'pre',
            opacity: 0,
            animation: `${letterReveal} .8s cubic-bezier(.2,.7,.2,1) forwards`,
            animationDelay: `${0.25 + i * 0.05}s`,
          }}
        >
          {ch}
        </Box>
      ))}
    </Typography>
  );
}

/* ------------- drifting sparkles (decorative, pure CSS) -------------- */
const SPARKLES = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 47) % 100}%`,
  size: 2 + (i % 4),
  delay: (i * 0.31) % 8,
  duration: 14 + (i % 6) * 2,
  opacity: 0.35 + ((i % 5) / 10),
}));

/* ====================================================================
                              The page
   ==================================================================== */
export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  // Subtle mouse parallax on the brand panel orbs.
  const brandRef = useRef(null);
  const [pxy, setPxy] = useState({ x: 0, y: 0 });
  const onMouseMove = (e) => {
    const r = brandRef.current?.getBoundingClientRect();
    if (!r) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setPxy({
      x: ((e.clientX - cx) / r.width) * 24,    // ±12px range
      y: ((e.clientY - cy) / r.height) * 24,
    });
  };
  const onMouseLeave = () => setPxy({ x: 0, y: 0 });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (data) => {
    setError(null);
    setSubmitting(true);
    try {
      await login(data.username.trim(), data.password);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e?.response?.data?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 0, sm: 3 },
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(1200px 600px at 10% 0%, #e8fff5 0%, transparent 60%),' +
          'radial-gradient(900px 600px at 100% 100%, #e7f0ff 0%, transparent 55%),' +
          'linear-gradient(135deg, #f4fbf7 0%, #f3f7ff 100%)',
      }}
    >
      {/* Outer page-level drifting blobs so even the gap around the card feels alive. */}
      <Box sx={{
        position: 'absolute', width: 420, height: 420, top: -120, right: -120,
        borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(11,122,74,0.18), transparent 65%)',
        animation: `${float} 22s ease-in-out infinite`,
      }} />
      <Box sx={{
        position: 'absolute', width: 480, height: 480, bottom: -150, left: -150,
        borderRadius: '50%', filter: 'blur(46px)', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(75,63,179,0.13), transparent 65%)',
        animation: `${floatReverse} 28s ease-in-out infinite`,
      }} />

      {/* ============= The card, with an animated glowing border ============= */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 1120,
          // Animated conic-gradient border that slowly rotates around the card.
          // We use a sibling pseudo-element so the inner Paper stays crisp.
          '&::before': {
            content: { xs: '"none"', sm: '""' },
            position: 'absolute',
            inset: -2,
            borderRadius: 40,
            padding: '2px',
            background:
              'conic-gradient(from 0deg, rgba(11,122,74,0.0), rgba(11,122,74,0.55), rgba(30,127,176,0.55), rgba(75,63,179,0.55), rgba(11,122,74,0.0))',
            WebkitMask:
              'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            animation: `${spinBorder} 14s linear infinite`,
            pointerEvents: 'none',
          },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            position: 'relative',
            width: '100%',
            minHeight: { xs: '100vh', sm: 660 },
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            borderRadius: { xs: 0, sm: 5 },
            overflow: 'hidden',
            border: { xs: 'none', sm: '1px solid rgba(15,23,42,0.06)' },
            boxShadow: {
              xs: 'none',
              sm: '0 50px 100px -30px rgba(11, 122, 74, 0.25), 0 22px 50px -25px rgba(81, 66, 171, 0.22)',
            },
          }}
        >
          {/* ============== LEFT / BRAND PANEL ============== */}
          <Box
            ref={brandRef}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            sx={{
              flex: 1.05,
              display: { xs: 'none', md: 'flex' },
              flexDirection: 'column',
              p: { md: 5, lg: 6 },
              position: 'relative',
              overflow: 'hidden',
              color: '#fff',
              background:
                'linear-gradient(135deg, #0b7a4a 0%, #0fa07c 25%, #1e7fb0 55%, #4b3fb3 85%, #6a3fb3 100%)',
              backgroundSize: '220% 220%',
              animation: `${gradientShift} 18s ease infinite`,
            }}
          >
            {/* Soft mouse-parallax orbs */}
            <Box sx={{
              position: 'absolute', width: 340, height: 340, top: -100, left: -100,
              borderRadius: '50%', filter: 'blur(22px)',
              background: 'radial-gradient(circle, rgba(255,255,255,0.38), transparent 65%)',
              animation: `${float} 14s ease-in-out infinite`,
              transform: `translate3d(${pxy.x}px, ${pxy.y}px, 0)`,
              transition: 'transform .35s ease-out',
              pointerEvents: 'none',
            }} />
            <Box sx={{
              position: 'absolute', width: 400, height: 400, bottom: -140, right: -120,
              borderRadius: '50%', filter: 'blur(30px)',
              background: 'radial-gradient(circle, rgba(255,255,255,0.24), transparent 65%)',
              animation: `${floatReverse} 18s ease-in-out infinite`,
              transform: `translate3d(${-pxy.x}px, ${-pxy.y}px, 0)`,
              transition: 'transform .35s ease-out',
              pointerEvents: 'none',
            }} />
            <Box sx={{
              position: 'absolute', width: 280, height: 280, top: '40%', right: '-70px',
              borderRadius: '50%', filter: 'blur(26px)',
              background: 'radial-gradient(circle, rgba(120,255,200,0.30), transparent 65%)',
              animation: `${float} 22s ease-in-out infinite`,
              transform: `translate3d(${pxy.x * 0.6}px, ${pxy.y * 0.6}px, 0)`,
              transition: 'transform .35s ease-out',
              pointerEvents: 'none',
            }} />

            {/* Subtle dot pattern overlay */}
            <Box sx={{
              position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.18,
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              maskImage: 'linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)',
            }} />

            {/* Drifting sparkles */}
            {SPARKLES.map((s, i) => (
              <Box
                key={i}
                sx={{
                  position: 'absolute',
                  bottom: -20,
                  left: s.left,
                  width: s.size, height: s.size,
                  borderRadius: '50%',
                  bgcolor: '#fff',
                  opacity: s.opacity,
                  animation: `${sparkleDrift} ${s.duration}s linear ${s.delay}s infinite`,
                  pointerEvents: 'none',
                  filter: 'blur(0.3px)',
                }}
              />
            ))}

            {/* Animated SVG wave at the bottom of the brand panel */}
            <Box sx={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: 110, pointerEvents: 'none', overflow: 'hidden',
            }}>
              <Box sx={{
                width: '200%', height: '100%',
                animation: `${waveDrift} 16s linear infinite`,
              }}>
                <svg
                  viewBox="0 0 1200 110" preserveAspectRatio="none"
                  width="100%" height="100%"
                >
                  <path
                    d="M0,60 C150,90 300,30 450,55 C600,80 750,30 900,50 C1050,70 1150,40 1200,55 L1200,110 L0,110 Z"
                    fill="rgba(255,255,255,0.08)"
                  />
                  <path
                    d="M0,75 C150,55 300,95 450,75 C600,55 750,90 900,72 C1050,55 1150,80 1200,68 L1200,110 L0,110 Z"
                    fill="rgba(255,255,255,0.10)"
                  />
                </svg>
              </Box>
            </Box>

            {/* Brand header */}
            <Stack
              direction="row"
              alignItems="center"
              spacing={2.5}
              sx={{ position: 'relative', mb: 2.5, animation: `${slideInLeft} .7s cubic-bezier(.2,.7,.2,1) both` }}
            >
              <Box
                sx={{
                  width: 76, height: 76,
                  borderRadius: '50%',
                  bgcolor: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                  border: '3px solid rgba(255,255,255,0.55)',
                  animation: `${breathe} 4.5s ease-in-out infinite`,
                  p: 0.75,
                }}
              >
                <Box
                  component="img"
                  src={settingsApi.logoUrl()}
                  alt="FEFSA"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <RevealText
                  text="FEFSA HOSPITAL"
                  sx={{
                    fontWeight: 900,
                    fontSize: { md: 28, lg: 32 },
                    letterSpacing: 1.2,
                    lineHeight: 1.1,
                    textShadow: '0 2px 14px rgba(0,0,0,0.18)',
                  }}
                />
                <Typography sx={{
                  fontSize: 11,
                  letterSpacing: 3.4,
                  opacity: 0.92,
                  mt: 0.6,
                  display: 'block',
                  animation: `${fadeUp} .8s ease-out both`,
                  animationDelay: '1.15s',
                }}>
                  ASTHMA · PULMONOLOGY · CHEST CARE
                </Typography>
              </Box>
            </Stack>

            <Typography
              sx={{
                position: 'relative',
                opacity: 0.95,
                mb: 3,
                fontSize: 15,
                lineHeight: 1.55,
                maxWidth: 400,
                animation: `${slideInLeft} .7s cubic-bezier(.2,.7,.2,1) both`,
                animationDelay: '.12s',
              }}
            >
              A premium chest-care and patient management platform crafted for
              Dr. Ajit B. Patel's pulmonology practice in Palanpur.
            </Typography>

            <Stack spacing={1.5} sx={{ position: 'relative', flex: 1, mt: 1 }}>
              {FEATURES.map((f, i) => (
                <FeatureCard
                  key={f.title}
                  icon={f.icon}
                  title={f.title}
                  desc={f.desc}
                  delay={0.55 + i * 0.12}
                />
              ))}
            </Stack>

            <Typography
              variant="caption"
              sx={{
                position: 'relative',
                mt: 4,
                opacity: 0.78,
                letterSpacing: 0.4,
                animation: `${fadeUp} .7s ease-out both`,
                animationDelay: '1.15s',
              }}
            >
              © 2026 FEFSA Hospital · Patient Management System — v1.0
            </Typography>
          </Box>

          {/* ============== RIGHT / FORM PANEL ============== */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              p: { xs: 3, sm: 5, md: 6 },
              bgcolor: '#ffffff',
              position: 'relative',
              animation: `${slideInRight} .55s cubic-bezier(.2,.7,.2,1) both`,
            }}
          >
            {/* Subtle green wash behind the form for warmth */}
            <Box sx={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background:
                'radial-gradient(600px 300px at 100% 0%, rgba(11,122,74,0.07), transparent 60%),' +
                'radial-gradient(500px 300px at 0% 100%, rgba(75,63,179,0.06), transparent 60%)',
            }} />

            {/* Mobile-only mini brand strip */}
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{ display: { xs: 'flex', md: 'none' }, mb: 3, position: 'relative' }}
            >
              <Box
                sx={{
                  width: 48, height: 48,
                  borderRadius: '50%',
                  bgcolor: 'rgba(11,122,74,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                  border: '2px solid rgba(11,122,74,0.18)',
                  p: 0.5,
                }}
              >
                <Box
                  component="img"
                  src={settingsApi.logoUrl()}
                  alt="FEFSA"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#0b7a4a', letterSpacing: 1, lineHeight: 1.1 }}>
                  FEFSA HOSPITAL
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1.5 }}>
                  ASTHMA · CHEST CARE
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ position: 'relative', animation: `${fadeUp} .55s ease-out both`, animationDelay: '.15s' }}>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 900,
                  fontSize: { xs: 30, sm: 38 },
                  mb: 0.5,
                  lineHeight: 1.1,
                  letterSpacing: -0.5,
                  background:
                    'linear-gradient(120deg, #0b7a4a 0%, #1e7fb0 60%, #4b3fb3 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Welcome back
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3.5, fontSize: 15 }}>
                Sign in to your FEFSA Hospital account to continue.
              </Typography>
            </Box>

            {error && (
              <Alert
                severity="error"
                sx={{ mb: 2, borderRadius: 2, animation: `${fadeUp} .35s ease-out`, position: 'relative' }}
              >
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ position: 'relative' }}>
              <FieldLabel htmlFor="login-username">Username</FieldLabel>
              <TextField
                id="login-username"
                fullWidth
                autoFocus
                hiddenLabel
                placeholder="Enter your username"
                error={!!errors.username}
                helperText={errors.username?.message}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonOutlineIcon sx={{ color: '#0b7a4a' }} />
                    </InputAdornment>
                  ),
                }}
                sx={inputSx(0.28)}
                {...register('username', { required: 'Username is required' })}
              />

              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <TextField
                id="login-password"
                type={showPwd ? 'text' : 'password'}
                fullWidth
                hiddenLabel
                placeholder="Enter your password"
                error={!!errors.password}
                helperText={errors.password?.message}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon sx={{ color: '#0b7a4a' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPwd((v) => !v)}
                        edge="end"
                        aria-label={showPwd ? 'Hide password' : 'Show password'}
                        sx={{
                          color: 'rgba(15,23,42,0.45)',
                          transition: 'color .2s ease, transform .2s ease',
                          '&:hover': { color: '#0b7a4a', transform: 'scale(1.08)' },
                        }}
                      >
                        {showPwd ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={inputSx(0.36)}
                {...register('password', { required: 'Password is required' })}
              />

              <Button
                type="submit"
                fullWidth
                size="large"
                disabled={submitting}
                endIcon={!submitting && <ArrowForwardIcon className="signinArrow" />}
                sx={{
                  mt: 3.5,
                  py: 1.7,
                  fontSize: 16,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  color: '#fff',
                  borderRadius: 3,
                  position: 'relative',
                  overflow: 'hidden',
                  background:
                    'linear-gradient(90deg, #0b7a4a 0%, #1e7fb0 50%, #4b3fb3 100%)',
                  backgroundSize: '200% auto',
                  animation: `${glowPulse} 3.6s ease-in-out infinite, ${fadeUp} .55s ease-out forwards`,
                  animationDelay: '0s, .45s',
                  opacity: 0,
                  transition:
                    'background-position .6s ease, transform .2s ease, box-shadow .3s ease, opacity .5s ease',
                  '&:hover': {
                    backgroundPosition: 'right center',
                    transform: 'translateY(-2px)',
                  },
                  '&:hover .signinArrow': { transform: 'translateX(4px)' },
                  '& .signinArrow': { transition: 'transform .25s ease' },
                  '&:active': { transform: 'translateY(0) scale(0.99)' },
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.38) 50%, transparent 70%)',
                    backgroundSize: '200% 100%',
                    animation: `${shimmer} 3.2s linear infinite`,
                    pointerEvents: 'none',
                  },
                  '&.Mui-disabled': {
                    color: 'rgba(255,255,255,0.9)',
                    background: 'linear-gradient(90deg, #9ec6b6, #a8c2db, #b9b3df)',
                    animation: 'none',
                  },
                }}
              >
                {submitting ? <CircularProgress size={22} color="inherit" /> : 'Sign In'}
              </Button>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              justifyContent="center"
              alignItems="center"
              sx={{
                mt: 3,
                opacity: 0,
                position: 'relative',
                animation: `${fadeUp} .55s ease-out forwards`,
                animationDelay: '.6s',
              }}
            >
              <VerifiedUserOutlinedIcon sx={{ fontSize: 16, color: '#0b7a4a' }} />
              <Typography variant="caption" color="text.secondary">
                Secure session · End-to-end encrypted credentials
              </Typography>
            </Stack>

          </Box>
        </Paper>
      </Box>
    </Box>
  );
}

/* ---------- a clean bold label that sits ABOVE the field ---------- */
function FieldLabel({ htmlFor, children }) {
  return (
    <Typography
      component="label"
      htmlFor={htmlFor}
      sx={{
        display: 'block',
        mt: 1.5,
        mb: 0.75,
        fontSize: 13,
        fontWeight: 700,
        color: '#0f172a',
        letterSpacing: 0.3,
      }}
    >
      {children}
    </Typography>
  );
}

/* ---------- input styling (rounded, focus glow, animated entry) ---------- */
const inputSx = (delay) => ({
  opacity: 0,
  animation: `${fadeUp} .55s ease-out forwards`,
  animationDelay: `${delay}s`,
  '& .MuiOutlinedInput-root': {
    borderRadius: 3,
    bgcolor: '#fff',
    transition: 'box-shadow .25s ease, border-color .25s ease, transform .2s ease',
    '& fieldset': { borderColor: 'rgba(15,23,42,0.12)' },
    '&:hover fieldset': { borderColor: 'rgba(11,122,74,0.45)' },
    '&.Mui-focused': {
      boxShadow: '0 0 0 4px rgba(11,122,74,0.12)',
      '& fieldset': { borderColor: '#0b7a4a', borderWidth: 1.5 },
    },
  },
  '& .MuiOutlinedInput-input::placeholder': {
    color: 'rgba(15,23,42,0.35)',
    opacity: 1,
  },
});
