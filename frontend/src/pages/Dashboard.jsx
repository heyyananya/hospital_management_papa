import { useEffect, useRef, useState } from 'react';
import { keyframes } from '@emotion/react';
import {
  Grid, Card, CardContent, Typography, Box, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableContainer, TableBody, Chip, Stack, Avatar,
} from '@mui/material';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocalHospitalOutlinedIcon from '@mui/icons-material/LocalHospitalOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';

import { dashboardApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/* ============================ animations ============================ */
const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const shimmerSweep = keyframes`
  0%   { transform: translateX(-110%); }
  100% { transform: translateX(110%); }
`;

/* ------------------ animated count-up number ------------------ */
function CountUp({ to, duration = 1200, suffix = '' }) {
  const [v, setV] = useState(0);
  const rafRef = useRef();
  useEffect(() => {
    if (to == null) { setV(0); return; }
    const target = Number(to) || 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration]);
  return <>{v.toLocaleString('en-IN')}{suffix}</>;
}

/* ------------------ premium gradient stat card ------------------ */
function GradientStat({ label, value, icon, gradient, delay = 0, sublabel }) {
  return (
    <Card
      sx={{
        position: 'relative',
        overflow: 'hidden',
        border: 0,
        color: '#fff',
        background: gradient,
        boxShadow: '0 18px 40px -22px rgba(15,23,42,0.4)',
        transition: 'transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s ease',
        opacity: 0,
        animation: `${fadeUp} .6s cubic-bezier(.2,.7,.2,1) ${delay}s forwards`,
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 26px 48px -22px rgba(15,23,42,0.5)',
        },
        // shimmer sweep on hover
        '&:hover::after': { animation: `${shimmerSweep} 1.2s ease forwards` },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)',
          transform: 'translateX(-110%)',
          pointerEvents: 'none',
        },
      }}
    >
      {/* soft glow blob in corner */}
      <Box sx={{
        position: 'absolute', width: 140, height: 140,
        right: -40, bottom: -40, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.25), transparent 65%)',
        filter: 'blur(8px)', pointerEvents: 'none',
      }} />

      <CardContent sx={{ position: 'relative', p: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
          <Avatar
            sx={{
              width: 42, height: 42,
              bgcolor: 'rgba(255,255,255,0.22)',
              color: '#fff',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.35)',
            }}
          >
            {icon}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" sx={{ opacity: 0.92, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>
              {label}
            </Typography>
            {sublabel && (
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.78 }}>
                {sublabel}
              </Typography>
            )}
          </Box>
        </Stack>
        <Typography sx={{ fontSize: 36, fontWeight: 900, lineHeight: 1, mt: 1 }}>
          <CountUp to={value ?? 0} />
        </Typography>
      </CardContent>
    </Card>
  );
}

const GRADIENTS = {
  green:  'linear-gradient(135deg, #0fa07c 0%, #0b7a4a 100%)',
  teal:   'linear-gradient(135deg, #1e9fb0 0%, #0e6a87 100%)',
  blue:   'linear-gradient(135deg, #4f8fdc 0%, #2253a6 100%)',
  amber:  'linear-gradient(135deg, #f0a93f 0%, #c2730a 100%)',
  purple: 'linear-gradient(135deg, #7b5cf5 0%, #4b3fb3 100%)',
  rose:   'linear-gradient(135deg, #f06292 0%, #b91c5c 100%)',
  slate:  'linear-gradient(135deg, #64748b 0%, #334155 100%)',
  emerald:'linear-gradient(135deg, #34c995 0%, #11814f 100%)',
};

/* ====================================================================
                              The page
   ==================================================================== */
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { notify } = useSnackbar();
  const { user } = useAuth();
  // Admin-only stat tiles (Today / Overall). Reception and MO get the same
  // welcome header + follow-ups list, minus the numbers.
  const showStats = user?.role === 'ADMIN';

  useEffect(() => {
    dashboardApi.summary()
      .then(setData)
      .catch((e) => notify(e?.response?.data?.message || 'Failed to load dashboard', 'error'))
      .finally(() => setLoading(false));
  }, [notify]);

  const hourGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };
  const doctorName = user?.fullName || 'Doctor';
  const todayCount = Number(data?.todayTotal || 0);

  // Colour-code the day's patient count for a quick temperature-check:
  //   ≤ 10   → green   (light day, all clear)
  //   11-20  → amber   (busier, "keep it up")
  //   21+    → red     (heavy load, brace for it)
  const loadTier = todayCount <= 10 ? 'low' : todayCount <= 20 ? 'medium' : 'high';
  const LOAD = {
    low: {
      gradient:  'linear-gradient(120deg, #0b7a4a, #1e8f5c)',
      bg:        'linear-gradient(120deg, #ffffff 0%, #edfaf3 55%, #dff5e6 100%)',
      border:    'rgba(11,122,74,0.20)',
      bloom:     'rgba(11,122,74,0.22)',
      shadow:    '0 20px 50px -30px rgba(11,122,74,0.45)',
      chipBg:    '#e6f4ea',
      chipColor: '#0b6d3a',
      badge:     'Light day — all clear',
      message:   'Have a smooth day ahead.',
    },
    medium: {
      gradient:  'linear-gradient(120deg, #a15c00, #d97706)',
      bg:        'linear-gradient(120deg, #ffffff 0%, #fff8ec 55%, #fff0d1 100%)',
      border:    'rgba(217,119,6,0.22)',
      bloom:     'rgba(217,119,6,0.22)',
      shadow:    '0 20px 50px -30px rgba(217,119,6,0.45)',
      chipBg:    '#fff3d6',
      chipColor: '#92400e',
      badge:     'Busy day — keep it up!',
      message:   'A solid day of work — you\'ve got this.',
    },
    high: {
      gradient:  'linear-gradient(120deg, #b71c1c, #e53935)',
      bg:        'linear-gradient(120deg, #ffffff 0%, #fff2f2 55%, #ffe0e0 100%)',
      border:    'rgba(211,47,47,0.22)',
      bloom:     'rgba(211,47,47,0.22)',
      shadow:    '0 20px 50px -30px rgba(211,47,47,0.45)',
      chipBg:    '#fdecea',
      chipColor: '#b71c1c',
      badge:     'Heavy load — brace yourself',
      message:   'A packed day today. Pace yourself and take breaks.',
    },
  }[loadTier];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <Box>
      {/* ================================================================
             Admin greeting card — permanent part of the dashboard.
             Shows the day's registered-patient count front-and-centre so
             the doctor knows the day's load the moment they land here.
             Reception / MO don't see it (the smaller header below is
             enough for them).
         ================================================================ */}
      {user?.role === 'ADMIN' && (
        <Card sx={{
          mb: 3, position: 'relative', overflow: 'hidden',
          borderRadius: 4,
          border: `1px solid ${LOAD.border}`,
          background: LOAD.bg,
          boxShadow: LOAD.shadow,
          animation: `${fadeUp} 0.55s ease-out both`,
        }}>
          {/* Soft tier-tinted bloom on the right side — colour matches the
              load tier so the whole card reads as a temperature indicator. */}
          <Box sx={{
            position: 'absolute', width: 380, height: 380,
            right: -120, top: -120, borderRadius: '50%',
            background: `radial-gradient(circle, ${LOAD.bloom}, transparent 65%)`,
            filter: 'blur(30px)', pointerEvents: 'none',
          }} />
          <Box sx={{
            position: 'absolute', width: 260, height: 260,
            left: -80, bottom: -100, borderRadius: '50%',
            background: `radial-gradient(circle, ${LOAD.bloom}, transparent 65%)`,
            opacity: 0.6,
            filter: 'blur(30px)', pointerEvents: 'none',
          }} />
          <CardContent sx={{ p: { xs: 2.5, sm: 3.5 }, position: 'relative' }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              justifyContent="space-between"
              spacing={2}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="overline" sx={{
                  letterSpacing: 2.5, color: 'text.secondary', fontWeight: 700,
                }}>
                  {new Date().toLocaleDateString('en-IN', {
                    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </Typography>
                <Typography sx={{
                  mt: 0.25, fontSize: { xs: 22, sm: 28 }, fontWeight: 900,
                  color: '#0b3d29', lineHeight: 1.15,
                }}>
                  {hourGreeting()}, {doctorName}
                </Typography>

                {/* Big animated number — today's registered patients. The
                    gradient colour swaps by tier (green / amber / red). */}
                <Stack direction="row" alignItems="baseline" spacing={1.25}
                  sx={{ mt: 1.5, animation: `${fadeUp} 0.6s ease-out .1s both` }}>
                  <Typography sx={{
                    fontSize: { xs: 54, sm: 68 }, fontWeight: 900, lineHeight: 1,
                    background: LOAD.gradient,
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}>
                    <CountUp to={todayCount} duration={900} />
                  </Typography>
                  <Typography sx={{
                    fontSize: 18, color: 'text.secondary', fontWeight: 700,
                  }}>
                    patient{todayCount === 1 ? '' : 's'}
                  </Typography>
                </Stack>
                <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 14 }}>
                  {todayCount === 0
                    ? 'No patients have registered yet today. Have a great day ahead.'
                    : todayCount === 1
                      ? 'has registered today.'
                      : 'have registered today.'}
                </Typography>
              </Box>

              {/* Load-tier badge — one glance tells the doctor the day's
                  temperature. Colours + wording match the tier. */}
              <Chip
                label={LOAD.badge}
                sx={{
                  bgcolor: LOAD.chipBg,
                  color: LOAD.chipColor,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  height: 36,
                  px: 1.5,
                  fontSize: 13,
                  border: `1px solid ${LOAD.border}`,
                  animation: `${fadeUp} 0.6s ease-out .2s both`,
                }}
              />
            </Stack>

            {/* Second-line reassurance / warning that also swaps by tier. */}
            <Typography sx={{
              mt: 1.5, color: LOAD.chipColor, fontWeight: 600, fontSize: 13,
              opacity: 0.9,
              animation: `${fadeUp} 0.6s ease-out .3s both`,
            }}>
              {LOAD.message}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* ------ Page header ------ */}
      <Box
        sx={{
          mb: 3, p: { xs: 2.5, sm: 3 },
          borderRadius: 4,
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          background:
            'linear-gradient(120deg, #0b7a4a 0%, #1a9162 35%, #1e7fb0 70%, #4b3fb3 100%)',
          boxShadow: '0 24px 50px -28px rgba(11,122,74,0.55)',
        }}
      >
        <Box sx={{
          position: 'absolute', width: 240, height: 240,
          right: -60, top: -60, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.25), transparent 65%)',
          filter: 'blur(20px)', pointerEvents: 'none',
        }} />
        <Box sx={{
          position: 'absolute', width: 200, height: 200,
          left: '40%', bottom: -90, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.18), transparent 65%)',
          filter: 'blur(24px)', pointerEvents: 'none',
        }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1} sx={{ position: 'relative' }}>
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.85, letterSpacing: 2 }}>
              DASHBOARD
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
              Welcome to FEFSA Hospital
            </Typography>
            <Typography sx={{ mt: 0.5, opacity: 0.92 }}>{today}</Typography>
          </Box>
          <Chip
            label="All systems normal"
            sx={{
              bgcolor: 'rgba(255,255,255,0.18)',
              color: '#fff',
              fontWeight: 700,
              letterSpacing: 0.5,
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.30)',
            }}
          />
        </Stack>
      </Box>

      {/* ------ Today snapshot + Overall — ADMIN only ------
          Reception and MO see the welcome banner and follow-ups list; the
          summary numbers are the doctor's overview and stay admin-only. */}
      {showStats && (
        <>
          <Typography variant="overline" color="text.secondary" sx={{ pl: 0.5, letterSpacing: 1.2 }}>
            TODAY
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6} md={3}>
              <GradientStat
                label="Today's Patients"
                value={data?.todayTotal}
                icon={<PeopleAltOutlinedIcon />}
                gradient={GRADIENTS.green}
                delay={0.0}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <GradientStat
                label="Completed Today"
                value={data?.todayCompleted}
                icon={<CheckCircleOutlineIcon />}
                gradient={GRADIENTS.emerald}
                delay={0.08}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <GradientStat
                label="Pending Today"
                value={data?.todayPending}
                icon={<HourglassEmptyIcon />}
                gradient={GRADIENTS.amber}
                delay={0.16}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <GradientStat
                label="Waiting for Doctor"
                value={data?.todayWaitingDoctor}
                icon={<LocalHospitalOutlinedIcon />}
                gradient={GRADIENTS.rose}
                delay={0.24}
              />
            </Grid>
          </Grid>

          <Typography variant="overline" color="text.secondary" sx={{ pl: 0.5, mt: 3, display: 'block', letterSpacing: 1.2 }}>
            OVERALL
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6} md={3}>
              <GradientStat
                label="This Month"
                value={data?.monthly}
                icon={<CalendarMonthOutlinedIcon />}
                gradient={GRADIENTS.teal}
                delay={0.32}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <GradientStat
                label={data?.fyLabel || 'This FY'}
                value={data?.fyCount}
                icon={<CalendarMonthOutlinedIcon />}
                gradient={GRADIENTS.teal}
                delay={0.34}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <GradientStat
                label="Total Patients"
                value={data?.totalPatients}
                icon={<GroupsOutlinedIcon />}
                gradient={GRADIENTS.blue}
                delay={0.40}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <GradientStat
                label="Total Visits"
                value={data?.totalVisits}
                icon={<MedicalServicesOutlinedIcon />}
                gradient={GRADIENTS.purple}
                delay={0.48}
              />
            </Grid>
          </Grid>
        </>
      )}

      {/* ------ Follow-ups + Recent ------ */}
      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{
            opacity: 0,
            animation: `${fadeUp} .6s ease-out .65s forwards`,
            transition: 'transform .25s ease, box-shadow .25s ease',
            '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 18px 36px -22px rgba(15,23,42,0.3)' },
          }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                <Avatar sx={{ bgcolor: 'rgba(11,122,74,0.10)', color: '#0b7a4a' }}>
                  <EventAvailableOutlinedIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" sx={{ lineHeight: 1.1 }}>Follow-ups Today</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Patients scheduled to return today
                  </Typography>
                </Box>
              </Stack>
              {(data?.followupsToday || []).length === 0
                ? <Typography color="text.secondary">No follow-ups scheduled for today.</Typography>
                : (
                  <TableContainer>
                    <Table size="small" sx={{ minWidth: 460 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Patient</TableCell>
                          <TableCell>Mobile</TableCell>
                          <TableCell>Case #</TableCell>
                          <TableCell>Notes</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.followupsToday.map((f, i) => (
                          <TableRow key={i} hover>
                            <TableCell sx={{ fontWeight: 600 }}>{f.patientName}</TableCell>
                            <TableCell>{f.mobile}</TableCell>
                            <TableCell><Chip size="small" color="primary" variant="outlined" label={f.caseNumber} /></TableCell>
                            <TableCell>{f.notes}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )
              }
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{
            opacity: 0,
            animation: `${fadeUp} .6s ease-out .75s forwards`,
            transition: 'transform .25s ease, box-shadow .25s ease',
            '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 18px 36px -22px rgba(15,23,42,0.3)' },
          }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
                <Avatar sx={{ bgcolor: 'rgba(30,127,176,0.10)', color: '#1e7fb0' }}>
                  <GroupsOutlinedIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" sx={{ lineHeight: 1.1 }}>Recent Patients</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Latest registrations across all roles
                  </Typography>
                </Box>
              </Stack>
              {(data?.recentPatients || []).length === 0
                ? <Typography color="text.secondary">No patients yet.</Typography>
                : (
                  <TableContainer>
                    <Table size="small" sx={{ minWidth: 460 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>UHID</TableCell>
                          <TableCell>Name</TableCell>
                          <TableCell>Village</TableCell>
                          <TableCell>Mobile</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.recentPatients.map((p) => (
                          <TableRow key={p.id} hover>
                            <TableCell><Chip size="small" label={p.patientCode} /></TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{p.patientName}</TableCell>
                            <TableCell>{p.village}</TableCell>
                            <TableCell>{p.mobile}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )
              }
            </CardContent>
          </Card>
        </Grid>
      </Grid>

    </Box>
  );
}
