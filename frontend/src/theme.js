import { createTheme } from '@mui/material/styles';

/**
 * FEFSA-branded theme.
 *
 * Design direction: clinical & calm, but with a premium polish — soft
 * shadows, generous rounding, and a single confident green accent that
 * matches the hospital logo. Every component override is small but
 * intentional so the look stays consistent across every page (sidebar,
 * cards, tables, buttons, inputs, chips).
 */
const PRIMARY      = '#0b7a4a';
const PRIMARY_DARK = '#08603a';
const PRIMARY_LIGHT = '#1a9162';
const PRIMARY_SOFT = '#edf7f2';
const SECONDARY    = '#1e7fb0';
const BORDER       = '#e3eae6';
const PAGE_BG      = '#f7faf8';
const INK          = '#0f172a';
const MUTED        = '#5b6573';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary:   { main: PRIMARY,   dark: PRIMARY_DARK, light: PRIMARY_LIGHT, contrastText: '#fff' },
    secondary: { main: SECONDARY, contrastText: '#fff' },
    background: {
      default: PAGE_BG,
      paper:   '#ffffff',
    },
    text: {
      primary:   INK,
      secondary: MUTED,
    },
    divider: BORDER,
    success: { main: '#15803d' },
    warning: { main: '#c2730a' },
    error:   { main: '#b91c1c' },
    info:    { main: SECONDARY },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif',
    h3: { fontWeight: 800, letterSpacing: -0.5 },
    h4: { fontWeight: 700, letterSpacing: -0.3 },
    h5: { fontWeight: 700, letterSpacing: -0.2 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0.2 },
  },
  components: {
    /* ---------------- chrome ---------------- */
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: PAGE_BG,
          // gentle accent gradient behind the page so the white cards pop
          backgroundImage:
            `radial-gradient(900px 500px at 0% -10%, ${PRIMARY_SOFT} 0%, transparent 55%),` +
            `radial-gradient(800px 500px at 100% 100%, #eaf2fb 0%, transparent 55%)`,
          backgroundAttachment: 'fixed',
        },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          background: 'rgba(15,23,42,0.18)',
          borderRadius: 10,
        },
        '*::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(15,23,42,0.30)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.85)',
          backdropFilter: 'saturate(180%) blur(10px)',
          WebkitBackdropFilter: 'saturate(180%) blur(10px)',
          color: INK,
          boxShadow: 'none',
          borderBottom: `1px solid ${BORDER}`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#ffffff',
          borderRight: `1px solid ${BORDER}`,
          backgroundImage:
            `linear-gradient(180deg, ${PRIMARY_SOFT} 0%, transparent 220px)`,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          margin: '2px 8px',
          transition: 'background-color .2s ease, color .2s ease',
          '&:hover': { backgroundColor: PRIMARY_SOFT },
          '&.Mui-selected': {
            backgroundColor: PRIMARY,
            color: '#fff',
            boxShadow: `0 8px 18px -10px ${PRIMARY}`,
            '& .MuiListItemIcon-root': { color: '#fff' },
            '&:hover': { backgroundColor: PRIMARY_DARK },
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: { minWidth: 36, color: MUTED },
      },
    },

    /* ---------------- surfaces ---------------- */
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          boxShadow:
            '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -16px rgba(15,23,42,0.12)',
          transition: 'box-shadow .25s ease, border-color .25s ease',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 20,
          '&:last-child': { paddingBottom: 20 },
          // Smaller padding on phones so cards don't eat horizontal space.
          '@media (max-width: 600px)': {
            padding: 14,
            '&:last-child': { paddingBottom: 14 },
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          // Most pages wrap tables in TableContainer; on tight viewports we
          // let the wrapper scroll horizontally instead of forcing layout.
          maxWidth: '100%',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        },
      },
    },

    /* ---------------- buttons ---------------- */
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 18,
          paddingRight: 18,
          transition:
            'transform .15s ease, box-shadow .25s ease, background-color .25s ease',
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${PRIMARY_LIGHT} 0%, ${PRIMARY} 60%, ${PRIMARY_DARK} 100%)`,
          boxShadow: `0 8px 18px -10px ${PRIMARY}`,
          '&:hover': {
            boxShadow: `0 12px 24px -10px ${PRIMARY}`,
            transform: 'translateY(-1px)',
          },
          '&:active': { transform: 'translateY(0)' },
        },
        outlinedPrimary: {
          borderColor: 'rgba(11,122,74,0.35)',
          '&:hover': {
            backgroundColor: PRIMARY_SOFT,
            borderColor: PRIMARY,
          },
        },
        sizeLarge: { paddingTop: 12, paddingBottom: 12 },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'background-color .2s ease, color .2s ease',
        },
      },
    },

    /* ---------------- inputs ---------------- */
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: '#fff',
          transition: 'box-shadow .2s ease, border-color .2s ease',
          '& fieldset': { borderColor: BORDER },
          '&:hover fieldset': { borderColor: 'rgba(11,122,74,0.45)' },
          '&.Mui-focused fieldset': {
            borderColor: PRIMARY,
            borderWidth: 1.5,
          },
          '&.Mui-focused': {
            boxShadow: `0 0 0 4px rgba(11,122,74,0.10)`,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: MUTED, '&.Mui-focused': { color: PRIMARY } },
      },
    },

    /* ---------------- tables ---------------- */
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          color: INK,
          backgroundColor: '#f4f8f5',
          borderBottom: `1px solid ${BORDER}`,
        },
        root: { borderColor: BORDER },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: '#fafdfb' },
        },
      },
    },

    /* ---------------- chips ---------------- */
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
        colorPrimary: {
          backgroundColor: PRIMARY_SOFT,
          color: PRIMARY_DARK,
        },
        outlinedPrimary: {
          borderColor: 'rgba(11,122,74,0.35)',
          color: PRIMARY_DARK,
        },
      },
    },

    /* ---------------- tabs ---------------- */
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: 2,
          background: `linear-gradient(90deg, ${PRIMARY_LIGHT}, ${PRIMARY_DARK})`,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 700,
          minHeight: 44,
          '&.Mui-selected': { color: PRIMARY_DARK },
        },
      },
    },

    /* ---------------- alerts ---------------- */
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12 },
        standardSuccess: { backgroundColor: '#e7f6ee', color: '#0f6b2e' },
        standardWarning: { backgroundColor: '#fef3e2', color: '#7a4a05' },
        standardError:   { backgroundColor: '#fdecec', color: '#7a1313' },
        standardInfo:    { backgroundColor: '#e6f1f8', color: '#0b4a6a' },
      },
    },

    /* ---------------- dialogs ---------------- */
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16 },
      },
    },
  },
});

export default theme;
