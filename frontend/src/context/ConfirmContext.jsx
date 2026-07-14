/**
 * App-wide "are you sure?" prompt.
 *
 * Two ways to use it:
 *   1. From components: `const confirm = useConfirm(); await confirm({...})`.
 *   2. Automatic on every PUT/DELETE: the axios interceptor in services/api.js
 *      calls the bridge below, so no page needs to be updated by hand.
 *
 * The `bridge` module-level object is how the axios interceptor reaches the
 * React tree — Provider installs its handler on mount, resets on unmount.
 * If the tree hasn't mounted yet (initial /me call fires before render), the
 * bridge falls back to auto-approve so the app can boot.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
  Stack, Alert,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';

const ConfirmContext = createContext(null);

// The axios interceptor imports this and calls `bridge.confirm(...)`. When
// the Provider mounts it installs the real handler; the initial no-op keeps
// early requests (e.g. /auth/me during boot) from hanging.
export const bridge = {
  confirm: async (_opts) => true,
};

const defaultTitles = {
  delete: 'Delete this record?',
  update: 'Save these changes?',
  generic: 'Are you sure?',
};
const defaultMessages = {
  delete: 'This action removes the record and can\'t be undone.',
  update: 'Do you really want to update this record with the changes above?',
  generic: 'Please confirm this action.',
};
const defaultConfirmLabels = {
  delete: 'Yes, delete',
  update: 'Yes, save',
  generic: 'Confirm',
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const openConfirm = useCallback((options = {}) => {
    // Merge caller-supplied fields with sensible defaults per variant.
    const variant = options.variant || 'generic';
    const merged = {
      variant,
      title: options.title || defaultTitles[variant],
      message: options.message || defaultMessages[variant],
      confirmLabel: options.confirmLabel || defaultConfirmLabels[variant],
      cancelLabel: options.cancelLabel || 'Cancel',
      // Optional extra context line — shows in a small alert below the message.
      // Useful for something like "Deleting user 'mo@123'".
      subject: options.subject,
    };
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState(merged);
    });
  }, []);

  // Install / uninstall the bridge so axios can reach the dialog.
  useEffect(() => {
    bridge.confirm = openConfirm;
    return () => {
      bridge.confirm = async () => true;
    };
  }, [openConfirm]);

  const respond = (ok) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    r?.(ok);
  };

  const value = useMemo(() => openConfirm, [openConfirm]);

  const icon = state?.variant === 'delete'
    ? <DeleteOutlineIcon color="error" />
    : state?.variant === 'update'
      ? <SaveOutlinedIcon color="primary" />
      : <WarningAmberIcon color="warning" />;

  const confirmColor = state?.variant === 'delete' ? 'error' : 'primary';

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => respond(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1.25}>
            {icon}
            <Typography variant="h6">{state?.title}</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: state?.subject ? 1.5 : 0 }}>
            {state?.message}
          </Typography>
          {state?.subject && (
            <Alert severity={state?.variant === 'delete' ? 'error' : 'info'} variant="outlined">
              {state.subject}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => respond(false)}>{state?.cancelLabel}</Button>
          <Button
            variant="contained"
            color={confirmColor}
            onClick={() => respond(true)}
            autoFocus
          >
            {state?.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Returns `confirm(options) => Promise<boolean>`. */
export const useConfirm = () => useContext(ConfirmContext);
