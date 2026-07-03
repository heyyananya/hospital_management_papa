import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  AppBar, Toolbar, IconButton, Typography, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, Box, Divider, Avatar, Menu, MenuItem,
  Breadcrumbs, Link, Chip, Badge, Popover, Stack, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, Snackbar, Alert as MuiAlert,
} from '@mui/material';
import dayjs from 'dayjs';
import { remindersApi, ipdApi } from '../services/endpoints.js';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SearchIcon from '@mui/icons-material/Search';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import SettingsIcon from '@mui/icons-material/Settings';
import LogoutIcon from '@mui/icons-material/Logout';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import NotificationsIcon from '@mui/icons-material/Notifications';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import VaccinesIcon from '@mui/icons-material/Vaccines';
import HotelIcon from '@mui/icons-material/Hotel';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import AssignmentIcon from '@mui/icons-material/Assignment';

import { useAuth } from '../context/AuthContext.jsx';

const DRAWER_WIDTH = 240;

// Sidebar structure — grouped for scanability. Each role gets an ordered
// list of sections; each section is `{ heading, items[] }`. `heading: null`
// means the group renders without a title (used for the lone Dashboard).
const NAV = {
  ADMIN: [
    { heading: null, items: [
      { to: '/',                label: 'Dashboard',           icon: <DashboardIcon /> },
    ]},
    { heading: 'Patients', items: [
      { to: '/patients/new',    label: 'Register Patient',    icon: <PersonAddIcon /> },
      { to: '/patients/search', label: 'Patients',            icon: <SearchIcon /> },
      { to: '/mo/stats',        label: 'Patients Attended',   icon: <AssessmentIcon /> },
    ]},
    { heading: 'Clinical Queues', items: [
      { to: '/mo',              label: 'MO Queue',            icon: <MonitorHeartIcon /> },
      { to: '/doctor',          label: 'Doctor Queue',        icon: <LocalHospitalIcon /> },
    ]},
    { heading: 'Records & Billing', items: [
      { to: '/visits',          label: 'All Visits',          icon: <ListAltIcon /> },
      { to: '/bills/auto',      label: 'Auto Generated Bills',icon: <ReceiptLongIcon /> },
      { to: '/registers/3c',    label: '3C Register OPD',     icon: <MenuBookIcon /> },
      { to: '/registers/3c-ipd',label: '3C Register IPD',     icon: <MenuBookIcon /> },
    ]},
    { heading: 'Masters', items: [
      { to: '/services',        label: 'Services & Prices',   icon: <CurrencyRupeeIcon /> },
      { to: '/masters',         label: 'Other Masters',       icon: <ListAltIcon /> },
      { to: '/disease-templates', label: 'Disease Medicines', icon: <VaccinesIcon /> },
      { to: '/wards-beds',      label: 'Rooms Master',        icon: <MeetingRoomIcon /> },
    ]},
    { heading: 'IPD', items: [
      { to: '/ipd/pending',     label: 'Pending Admissions',  icon: <HowToRegIcon /> },
      { to: '/ipd/patients',    label: 'IPD Patients',        icon: <HotelIcon /> },
      { to: '/ipd/discharged',  label: 'Discharged Patients', icon: <ExitToAppIcon /> },
      { to: '/ipd/indoor-sheet/recent', label: 'Recent Indoor Sheets', icon: <AssignmentIcon /> },
    ]},
    { heading: 'Administration', items: [
      { to: '/reminders',       label: 'Reminders',           icon: <NotificationsIcon /> },
      { to: '/users',           label: 'Users',               icon: <GroupIcon /> },
      { to: '/settings',        label: 'Settings',            icon: <SettingsIcon /> },
    ]},
  ],
  RECEPTIONIST: [
    { heading: null, items: [
      { to: '/',                label: 'Dashboard',           icon: <DashboardIcon /> },
    ]},
    { heading: 'Patients', items: [
      { to: '/patients/new',    label: 'Register Patient',    icon: <PersonAddIcon /> },
      { to: '/patients/search', label: 'Patients',            icon: <SearchIcon /> },
    ]},
    { heading: 'Records & Billing', items: [
      { to: '/visits',          label: 'Visits',              icon: <ListAltIcon /> },
      { to: '/bills/auto',      label: 'Auto Generated Bills',icon: <ReceiptLongIcon /> },
      { to: '/registers/3c',    label: '3C Register OPD',     icon: <MenuBookIcon /> },
      { to: '/registers/3c-ipd',label: '3C Register IPD',     icon: <MenuBookIcon /> },
    ]},
    { heading: 'IPD', items: [
      { to: '/ipd/pending',     label: 'Pending Admissions',  icon: <HowToRegIcon /> },
      { to: '/ipd/patients',    label: 'IPD Patients',        icon: <HotelIcon /> },
      { to: '/ipd/discharged',  label: 'Discharged Patients', icon: <ExitToAppIcon /> },
    ]},
    { heading: 'Masters', items: [
      { to: '/services',        label: 'Services & Prices',   icon: <CurrencyRupeeIcon /> },
      { to: '/wards-beds',      label: 'Rooms Master',        icon: <MeetingRoomIcon /> },
    ]},
    { heading: 'Administration', items: [
      { to: '/settings',        label: 'Settings',            icon: <SettingsIcon /> },
    ]},
  ],
  MEDICAL_OFFICER: [
    { heading: null, items: [
      { to: '/',                label: 'Dashboard',           icon: <DashboardIcon /> },
    ]},
    { heading: 'Clinical', items: [
      { to: '/mo',              label: 'MO Queue',            icon: <MonitorHeartIcon /> },
      { to: '/mo/stats',        label: 'My Attended Patients',icon: <AssessmentIcon /> },
    ]},
    { heading: 'Patients', items: [
      { to: '/patients/new',    label: 'Register Patient',    icon: <PersonAddIcon /> },
      { to: '/patients/search', label: 'Patients',            icon: <SearchIcon /> },
    ]},
  ],
};

const roleLabel = {
  ADMIN: 'Admin / Doctor',
  RECEPTIONIST: 'Receptionist',
  MEDICAL_OFFICER: 'Medical Officer',
};

export default function MainLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);

  // Active reminders — drive both the bell badge and the login popup.
  const [activeReminders, setActiveReminders] = useState([]);
  const [bellAnchor, setBellAnchor] = useState(null);
  const [loginPopupOpen, setLoginPopupOpen] = useState(false);

  // Indoor-sheet notification for ADMIN — floats a snackbar when reception
  // saves vitals for any admitted patient. Uses localStorage to remember
  // when the doctor last saw the dashboard so the same update doesn't nag
  // twice.
  const [indoorNotice, setIndoorNotice] = useState(null); // { count, at }

  // Fetch active reminders on mount + every 5 minutes.
  // The login popup fires every time the user lands here after authenticating
  // (per the admin's request — always nag, not just first session).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let firstFetch = true;
    const fetchActive = async () => {
      try {
        const rows = await remindersApi.listActive();
        if (cancelled) return;
        setActiveReminders(rows);
        if (firstFetch && rows.length > 0) setLoginPopupOpen(true);
        firstFetch = false;
      } catch { /* ignore — bell just stays empty */ }
    };
    fetchActive();
    const t = setInterval(fetchActive, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user?.id]);

  // Poll indoor-sheet activity for ADMIN only. `dcms.indoorSheet.lastSeenAt`
  // is stamped when the doctor opens the Recent dashboard (see that page),
  // so we only show the notification for edits made AFTER that moment.
  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let cancelled = false;
    const KEY = 'dcms.indoorSheet.lastSeenAt';
    // First-visit-ever: seed lastSeenAt to now so we don't page-load an
    // ancient backlog as "new".
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, new Date().toISOString());
    }
    const check = async () => {
      try {
        const since = localStorage.getItem(KEY);
        const r = await ipdApi.indoorSheet.recentCount({ hours: 6, since });
        if (cancelled) return;
        if (r.count > 0) {
          setIndoorNotice({ count: r.count, at: r.lastUpdatedAt });
        }
      } catch { /* silent — poll again next tick */ }
    };
    // Kick off after a short delay so we don't race the login handshake.
    const kickoff = setTimeout(check, 1500);
    const t = setInterval(check, 60 * 1000);
    return () => { cancelled = true; clearTimeout(kickoff); clearInterval(t); };
  }, [user?.id, user?.role]);

  const dismissIndoorNotice = () => {
    // Stamp last-seen so the same update doesn't reappear.
    localStorage.setItem('dcms.indoorSheet.lastSeenAt', new Date().toISOString());
    setIndoorNotice(null);
  };
  const viewIndoorNotice = () => {
    dismissIndoorNotice();
    navigate('/ipd/indoor-sheet/recent');
  };

  const sections = NAV[user?.role] || [];
  const allItems = sections.flatMap((s) => s.items);

  // Pick the single sidebar entry whose `to` is the *longest* prefix of the
  // current pathname. A naive startsWith check lit up both /mo and /mo/stats
  // at the same time — this guarantees exactly one item is selected.
  const matchLen = (to, path) => {
    if (to === '/') return path === '/' ? 1 : 0;
    if (path === to) return to.length;
    if (path.startsWith(to + '/')) return to.length;
    return 0;
  };
  const selectedTo = allItems.reduce(
    (best, it) => {
      const len = matchLen(it.to, location.pathname);
      return len > best.len ? { to: it.to, len } : best;
    },
    { to: null, len: 0 }
  ).to;

  const drawer = (
    <Box>
      <Toolbar sx={{ px: 2, gap: 1.25 }}>
        <Box
          sx={{
            width: 36, height: 36,
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a9162 0%, #0b7a4a 100%)',
            color: '#fff',
            boxShadow: '0 6px 14px -8px rgba(11,122,74,0.6)',
            fontWeight: 800,
            letterSpacing: 0.5,
          }}
        >
          FH
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ lineHeight: 1.1, fontWeight: 800, letterSpacing: 0.4 }}>
            FEFSA HOSPITAL
          </Typography>
          <Typography variant="caption" color="text.secondary">Management System</Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List sx={{ py: 1 }}>
        {sections.map((section, si) => (
          <Box key={section.heading || `_g${si}`}>
            {section.heading && (
              <Typography
                variant="overline"
                sx={{
                  display: 'block',
                  px: 2, pt: si === 0 ? 0.5 : 1.75, pb: 0.5,
                  color: 'text.disabled',
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                {section.heading}
              </Typography>
            )}
            {section.items.map((it) => {
              const selected = it.to === selectedTo;
              return (
                <ListItemButton
                  key={it.to}
                  component={RouterLink}
                  to={it.to}
                  selected={selected}
                  onClick={() => setMobileOpen(false)}
                >
                  <ListItemIcon>{it.icon}</ListItemIcon>
                  <ListItemText
                    primary={it.label}
                    primaryTypographyProps={{ fontWeight: selected ? 700 : 500, fontSize: 14 }}
                  />
                </ListItemButton>
              );
            })}
          </Box>
        ))}
      </List>
    </Box>
  );

  // Build breadcrumbs from URL parts.
  const crumbs = location.pathname.split('/').filter(Boolean);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen((v) => !v)}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            noWrap
            sx={{
              flexGrow: 1,
              fontWeight: 800,
              letterSpacing: 0.4,
              fontSize: { xs: 16, sm: 18, md: 20 },
              background: 'linear-gradient(135deg, #0b7a4a 0%, #1e7fb0 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              minWidth: 0,
            }}
          >
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>FEFSA Hospital</Box>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>FEFSA Hospital — Management</Box>
          </Typography>
          <Chip
            label={roleLabel[user?.role] || user?.role}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ mr: 1.5, display: { xs: 'none', sm: 'inline-flex' } }}
          />
          <IconButton
            color="inherit"
            onClick={(e) => setBellAnchor(e.currentTarget)}
            sx={{ mr: 1 }}
            aria-label="Active reminders"
          >
            <Badge badgeContent={activeReminders.length} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          <Popover
            open={Boolean(bellAnchor)}
            anchorEl={bellAnchor}
            onClose={() => setBellAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { width: 360, maxHeight: 420 } }}
          >
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Active reminders
              </Typography>
              {activeReminders.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No active reminders right now.
                </Typography>
              ) : (
                <Stack spacing={1.25}>
                  {activeReminders.map((r) => (
                    <Box
                      key={r.id}
                      sx={{
                        p: 1.25,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        backgroundColor: '#fff8e1',
                      }}
                    >
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 0.5 }}>
                        {r.text}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Until {dayjs(r.endsAt).format('DD MMM YY, HH:mm')}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
              {user?.role === 'ADMIN' && (
                <Box sx={{ mt: 2, textAlign: 'right' }}>
                  <Button
                    size="small"
                    onClick={() => { setBellAnchor(null); navigate('/reminders'); }}
                  >
                    Manage reminders
                  </Button>
                </Box>
              )}
            </Box>
          </Popover>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} size="small">
            <Avatar
              sx={{
                width: 34, height: 34,
                background: 'linear-gradient(135deg, #1a9162 0%, #0b7a4a 100%)',
                fontWeight: 700,
                boxShadow: '0 4px 12px -4px rgba(11,122,74,0.55)',
              }}
            >
              {user?.fullName?.[0]?.toUpperCase() || 'U'}
            </Avatar>
          </IconButton>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            <MenuItem disabled>{user?.fullName}</MenuItem>
            <Divider />
            <MenuItem onClick={() => { setAnchor(null); logout(); }}>
              <LogoutIcon fontSize="small" sx={{ mr: 1 }} /> Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          width: { xs: '100%', sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          minWidth: 0,                    // lets children with overflow shrink properly
        }}
      >
        <Toolbar />
        {crumbs.length > 0 && (
          <Breadcrumbs
            sx={{
              mb: 2,
              display: { xs: 'none', sm: 'flex' },     // hide on phones (saves vertical space)
            }}
          >
            <Link component={RouterLink} to="/" underline="hover" color="inherit">Home</Link>
            {crumbs.map((c, i) => {
              const to = '/' + crumbs.slice(0, i + 1).join('/');
              const last = i === crumbs.length - 1;
              return last
                ? <Typography key={to} color="text.primary" sx={{ textTransform: 'capitalize' }}>{c}</Typography>
                : <Link key={to} component={RouterLink} to={to} underline="hover" color="inherit" sx={{ textTransform: 'capitalize' }}>{c}</Link>;
            })}
          </Breadcrumbs>
        )}
        <Outlet />
      </Box>

      <Dialog
        open={loginPopupOpen}
        onClose={() => setLoginPopupOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 20px 60px -20px rgba(217, 119, 6, 0.35)',
          },
        }}
      >
        {/* Gradient header */}
        <Box
          sx={{
            position: 'relative',
            px: 3, py: 2.5,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#fff',
            display: 'flex', alignItems: 'center', gap: 2,
          }}
        >
          {/* Soft pulsing bell */}
          <Box
            sx={{
              width: 52, height: 52,
              borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 0 rgba(255,255,255,0.6)',
              animation: 'rmpulse 1.8s ease-in-out infinite',
              '@keyframes rmpulse': {
                '0%':   { boxShadow: '0 0 0 0 rgba(255,255,255,0.55)' },
                '70%':  { boxShadow: '0 0 0 14px rgba(255,255,255,0)' },
                '100%': { boxShadow: '0 0 0 0 rgba(255,255,255,0)' },
              },
            }}
          >
            <NotificationsIcon sx={{ color: '#fff', fontSize: 28 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
              You have {activeReminders.length} active reminder{activeReminders.length === 1 ? '' : 's'}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.92 }}>
              Welcome back, {user?.fullName || 'Doctor'} — here's what to keep in mind today.
            </Typography>
          </Box>
        </Box>

        <DialogContent sx={{ p: 3, bgcolor: '#fffbf2' }}>
          <Stack spacing={1.5}>
            {activeReminders.map((r, idx) => {
              const endsIn = dayjs(r.endsAt).diff(dayjs(), 'hour');
              const endsLabel = endsIn >= 24
                ? `${Math.round(endsIn / 24)} day${Math.round(endsIn / 24) === 1 ? '' : 's'} left`
                : endsIn >= 1
                  ? `${endsIn} hour${endsIn === 1 ? '' : 's'} left`
                  : 'Ending soon';
              return (
                <Box
                  key={r.id}
                  sx={{
                    position: 'relative',
                    p: 2,
                    pl: 2.5,
                    bgcolor: '#fff',
                    borderRadius: 2,
                    border: '1px solid #f0e5c5',
                    boxShadow: '0 1px 0 rgba(0,0,0,0.02)',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      left: 0, top: 8, bottom: 8, width: 4,
                      borderRadius: 4,
                      bgcolor: '#f59e0b',
                    },
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                    <Chip
                      label={idx + 1}
                      size="small"
                      sx={{
                        bgcolor: '#fef3c7',
                        color: '#92400e',
                        fontWeight: 700,
                        height: 22,
                        minWidth: 22,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body1"
                        sx={{ whiteSpace: 'pre-wrap', fontWeight: 500, mb: 0.5 }}
                      >
                        {r.text}
                      </Typography>
                      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                        <Typography variant="caption" color="text.secondary">
                          Until {dayjs(r.endsAt).format('DD MMM, HH:mm')}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={endsLabel}
                          sx={{
                            height: 20,
                            fontSize: 11,
                            borderColor: '#fcd34d',
                            color: '#92400e',
                          }}
                        />
                      </Stack>
                    </Box>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, bgcolor: '#fffbf2', borderTop: '1px solid #f5e6c1' }}>
          {user?.role === 'ADMIN' && (
            <Button
              onClick={() => { setLoginPopupOpen(false); navigate('/reminders'); }}
              sx={{ mr: 'auto', color: '#92400e' }}
            >
              Manage reminders
            </Button>
          )}
          <Button
            onClick={() => setLoginPopupOpen(false)}
            variant="contained"
            sx={{
              bgcolor: '#d97706',
              fontWeight: 700,
              px: 3,
              '&:hover': { bgcolor: '#b45309' },
            }}
          >
            Got it, thanks
          </Button>
        </DialogActions>
      </Dialog>

      {/* Indoor sheet notification (ADMIN only). Persistent snackbar with a
          jump-to-dashboard action; auto-hides only after the doctor clicks. */}
      <Snackbar
        open={!!indoorNotice}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MuiAlert
          severity="info"
          variant="filled"
          onClose={dismissIndoorNotice}
          sx={{ minWidth: 340, alignItems: 'center', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.35)' }}
          action={
            <>
              <Button color="inherit" size="small" onClick={viewIndoorNotice} sx={{ fontWeight: 700 }}>
                View once
              </Button>
              <IconButton size="small" color="inherit" onClick={dismissIndoorNotice}>
                <Box component="span" sx={{ fontSize: 18, lineHeight: 1 }}>×</Box>
              </IconButton>
            </>
          }
        >
          {indoorNotice?.count === 1
            ? '1 patient has new vitals'
            : `${indoorNotice?.count || 0} patients have new vitals`}
          {indoorNotice?.at ? ` — updated ${dayjs(indoorNotice.at).format('HH:mm')}` : ''}
        </MuiAlert>
      </Snackbar>
    </Box>
  );
}
