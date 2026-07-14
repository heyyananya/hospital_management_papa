/**
 * Admin: Rooms & Beds Master — visual "floor plan" view.
 *
 *   [ GENERAL ROOM ]
 *   ┌──────────────────────────────────┐
 *   │ [Bed 1] [Bed 2] [Bed 3] [Bed 4]  │
 *   │ [Bed 5] [Bed 6] [Bed 7] [ + ]    │
 *   └──────────────────────────────────┘
 *
 * Each ward is a big bordered card; each bed inside is a dashed square that
 * shows its number, and (in orange) an "OCCUPIED" badge when someone is
 * currently admitted to it. The "+" tile opens the bulk-add dialog scoped
 * to that ward.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Stack, Button, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  CircularProgress, Alert, Autocomplete, Menu, Paper, Grid, Divider,
  FormControlLabel, Switch,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import HotelIcon from '@mui/icons-material/Hotel';

import { ipdApi } from '../services/endpoints.js';
import { useSnackbar } from '../context/SnackbarContext.jsx';

const BED_TYPE_SUGGESTIONS = ['General', 'Special', 'IRCU', 'Semi-Private', 'Private', 'ICU'];

const STATUS_STYLE = {
  FREE:              { border: '#c8d0da', bg: '#fff',       label: null,       chipColor: '#3b6d11' },
  OCCUPIED:          { border: '#f59e0b', bg: '#fff7e6',    label: 'OCCUPIED', chipColor: '#92400e' },
  UNDER_MAINTENANCE: { border: '#94a3b8', bg: '#f1f5f9',    label: 'CLOSED',   chipColor: '#334155' },
};

/* --------------------------- Small components --------------------------- */

function BedTile({ bed, onClick }) {
  const s = STATUS_STYLE[bed.status] || STATUS_STYLE.FREE;
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      sx={{
        width: 108, height: 96, p: 1,
        border: '2px dashed',
        borderColor: s.border,
        borderRadius: 1.5,
        bgcolor: s.bg,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        transition: 'transform .1s ease, border-color .15s ease, background-color .15s ease',
        '&:hover': { transform: 'translateY(-1px)', borderColor: '#0b7a4a' },
      }}
    >
      <Typography sx={{ fontWeight: 700, textAlign: 'center', lineHeight: 1.1 }}>
        {bed.bedNumber}
      </Typography>
      {s.label && (
        <Chip
          size="small" label={s.label}
          sx={{
            mt: 0.5, height: 18, fontSize: 10, fontWeight: 700,
            bgcolor: 'transparent', color: s.chipColor,
            border: `1px solid ${s.chipColor}`,
          }}
        />
      )}
    </Box>
  );
}

/**
 * Private-room variant — the bed sits inside its own outlined "room" card
 * to make it obvious this is a self-contained private room (Special / IRCU).
 */
function PrivateRoomTile({ bed, index, onClick }) {
  const s = STATUS_STYLE[bed.status] || STATUS_STYLE.FREE;
  const roomLabel = `Room ${index + 1}`;
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      sx={{
        width: 148, height: 128, p: 1.25,
        border: '2px solid #0d527e',
        borderRadius: 2,
        display: 'flex', flexDirection: 'column',
        cursor: 'pointer',
        bgcolor: '#fff',
        '&:hover': { boxShadow: '0 4px 14px -6px rgba(13,82,126,0.35)' },
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, color: '#0d527e', letterSpacing: 0.5 }}>
        {roomLabel}
      </Typography>
      <Box
        sx={{
          mt: 0.5, flex: 1,
          border: '2px dashed',
          borderColor: s.border,
          borderRadius: 1.5,
          bgcolor: s.bg,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          minHeight: 60,
        }}
      >
        <Typography sx={{ fontWeight: 700, lineHeight: 1 }}>{bed.bedNumber}</Typography>
        {s.label && (
          <Chip
            size="small" label={s.label}
            sx={{
              mt: 0.5, height: 18, fontSize: 10, fontWeight: 700,
              bgcolor: 'transparent', color: s.chipColor,
              border: `1px solid ${s.chipColor}`,
            }}
          />
        )}
      </Box>
    </Box>
  );
}

function AddTile({ onClick, large = false }) {
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      sx={{
        width: large ? 148 : 108, height: large ? 128 : 96,
        border: '2px dashed #c8d0da',
        borderRadius: large ? 2 : 1.5,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        color: 'text.secondary',
        '&:hover': { borderColor: '#0b7a4a', color: '#0b7a4a', bgcolor: '#f6faf7' },
      }}
    >
      <AddIcon sx={{ fontSize: 34 }} />
    </Box>
  );
}

function RoomCard({ ward, beds, onAddBeds, onAddSingle, onEditBed, onEditWard, onRemoveWard }) {
  const [menuEl, setMenuEl] = useState(null);
  const total = beds.length;
  const free  = beds.filter((b) => b.status === 'FREE').length;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 3, borderRadius: 2, borderWidth: 2, borderColor: '#0d527e', mb: 3 }}
    >
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="center" spacing={2} sx={{ mb: 2 }}>
        <Chip
          label={ward.name.toUpperCase()}
          variant="outlined"
          sx={{
            fontWeight: 800, letterSpacing: 1.5, fontSize: 15,
            px: 3, py: 2.5, borderRadius: 1,
            borderWidth: 2, borderColor: '#0d527e', color: '#0d527e',
          }}
        />
        <Chip
          size="small"
          label={`${free}/${total} free`}
          color={free > 0 ? 'success' : 'warning'}
          variant="outlined"
        />
        <Box sx={{ position: 'absolute', right: 32 }}>
          <IconButton onClick={(e) => setMenuEl(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
          <Menu anchorEl={menuEl} open={Boolean(menuEl)} onClose={() => setMenuEl(null)}>
            <MenuItem onClick={() => { setMenuEl(null); onAddBeds(ward); }}>
              <PlaylistAddIcon fontSize="small" sx={{ mr: 1 }} /> Bulk add beds
            </MenuItem>
            <MenuItem onClick={() => { setMenuEl(null); onAddSingle(ward); }}>
              <AddIcon fontSize="small" sx={{ mr: 1 }} /> Add single bed
            </MenuItem>
            <MenuItem onClick={() => { setMenuEl(null); onEditWard(ward); }}>
              <EditIcon fontSize="small" sx={{ mr: 1 }} /> Rename room
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setMenuEl(null); onRemoveWard(ward); }} sx={{ color: 'error.main' }}>
              <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} /> Delete room
            </MenuItem>
          </Menu>
        </Box>
      </Stack>

      {/* Bed grid — shared vs private layout */}
      {ward.isPrivate ? (
        <Grid container spacing={2.5} justifyContent="flex-start">
          {beds.map((bed, idx) => (
            <Grid item key={bed.id}>
              <PrivateRoomTile bed={bed} index={idx} onClick={() => onEditBed(bed, ward)} />
            </Grid>
          ))}
          <Grid item>
            <AddTile large onClick={() => onAddBeds(ward)} />
          </Grid>
        </Grid>
      ) : (
        <Grid container spacing={2} justifyContent="flex-start">
          {beds.map((bed) => (
            <Grid item key={bed.id}>
              <BedTile bed={bed} onClick={() => onEditBed(bed, ward)} />
            </Grid>
          ))}
          <Grid item>
            <AddTile onClick={() => onAddBeds(ward)} />
          </Grid>
        </Grid>
      )}
    </Paper>
  );
}

/* ------------------------------- Page -------------------------------- */

export default function WardsAndBeds() {
  const [wards, setWards] = useState([]);
  const [allBeds, setAllBeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wardDialog, setWardDialog] = useState(null);
  const [bedDialog, setBedDialog] = useState(null);
  const [bulkDialog, setBulkDialog] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const { notify } = useSnackbar();

  const load = async () => {
    setLoading(true);
    try {
      const [w, b] = await Promise.all([ipdApi.wards.list(), ipdApi.beds.list()]);
      setWards(w);
      setAllBeds(b);
    } catch (e) {
      notify('Failed to load rooms', 'error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const bedsByWard = useMemo(() => {
    const map = {};
    for (const b of allBeds) {
      (map[b.wardId] = map[b.wardId] || []).push(b);
    }
    return map;
  }, [allBeds]);

  /* -------- Ward CRUD -------- */
  const saveWard = async () => {
    const w = wardDialog;
    const payload = { name: w.name, isPrivate: !!w.isPrivate };
    try {
      if (w.id) await ipdApi.wards.update(w.id, payload);
      else      await ipdApi.wards.create(payload);
      notify('Saved', 'success');
      setWardDialog(null);
      await load();
    } catch (e) { notify(e?.response?.data?.message || 'Save failed', 'error'); }
  };
  const removeWard = async (w) => {
    try {
      await ipdApi.wards.remove(w.id);
      notify('Room removed', 'success');
      await load();
    } catch (e) {
      if (e?.cancelled) return;
      notify(e?.response?.data?.message || 'Failed', 'error');
    }
  };

  /* -------- Single-bed edit / add -------- */
  const openEditBed = (bed, ward) => setBedDialog({ ...bed, wardName: ward?.name });
  const openAddSingle = (ward) => setBedDialog({
    wardId: ward.id, wardName: ward.name,
    bedNumber: '', bedType: ward.name || 'General',
  });
  const saveBed = async () => {
    const b = bedDialog;
    try {
      if (b.id) {
        await ipdApi.beds.update(b.id, { bedType: b.bedType });
      } else {
        await ipdApi.beds.create({
          wardId: b.wardId, bedNumber: b.bedNumber,
          bedType: b.bedType,
        });
      }
      notify('Saved', 'success');
      setBedDialog(null);
      await load();
    } catch (e) { notify(e?.response?.data?.message || 'Save failed', 'error'); }
  };
  const removeBed = async () => {
    const b = bedDialog;
    if (!b?.id) return;
    try {
      await ipdApi.beds.remove(b.id);
      notify('Bed removed', 'success');
      setBedDialog(null);
      await load();
    } catch (e) {
      if (e?.cancelled) return;
      notify(e?.response?.data?.message || 'Failed', 'error');
    }
  };

  /* -------- Bulk add -------- */
  const openBulk = (ward) => setBulkDialog({
    wardId: ward.id, wardName: ward.name,
    bedType: ward.name || 'General',
    count: ward.isPrivate ? 3 : 7,
    // Private rooms number as "Room 1, Room 2 …"; shared wards as "Bed 1 …".
    prefix: ward.isPrivate ? 'Room ' : 'Bed ',
    startNumber: (bedsByWard[ward.id]?.length || 0) + 1,
    padWidth: 1,
  });
  const bulkCreate = async () => {
    setBulkSaving(true);
    try {
      const res = await ipdApi.beds.bulkCreate({
        wardId: bulkDialog.wardId,
        bedType: bulkDialog.bedType,
        count: Number(bulkDialog.count),
        prefix: bulkDialog.prefix || '',
        startNumber: Number(bulkDialog.startNumber) || 1,
        padWidth: Number(bulkDialog.padWidth) || 1,
      });
      const added = res.inserted?.length || 0;
      const skipped = res.conflicts?.length || 0;
      notify(
        `Created ${added} bed${added === 1 ? '' : 's'}${skipped ? ` — ${skipped} duplicates skipped` : ''}`,
        added ? 'success' : 'warning'
      );
      setBulkDialog(null);
      await load();
    } catch (e) {
      notify(e?.response?.data?.message || 'Bulk create failed', 'error');
    } finally { setBulkSaving(false); }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h5">Rooms & Beds Master</Typography>
        <Button
          variant="contained" startIcon={<AddIcon />}
          onClick={() => setWardDialog({ name: '' })}
        >
          Add Room
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Set up your rooms below (General Room / Special Room / IRCU …) and drop beds
        into each. Occupied beds are highlighted so it's clear at a glance which are in use.
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : wards.length === 0 ? (
        <Alert severity="info">
          No rooms yet. Click <b>Add Room</b> to create your first (e.g. General Room,
          Special Room, IRCU).
        </Alert>
      ) : (
        wards.map((w) => (
          <RoomCard
            key={w.id}
            ward={w}
            beds={bedsByWard[w.id] || []}
            onAddBeds={openBulk}
            onAddSingle={openAddSingle}
            onEditBed={openEditBed}
            onEditWard={(w) => setWardDialog(w)}
            onRemoveWard={removeWard}
          />
        ))
      )}

      {/* --- Room (ward) dialog --- */}
      <Dialog open={!!wardDialog} onClose={() => setWardDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{wardDialog?.id ? 'Edit room' : 'Add Room'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Room name *" autoFocus fullWidth
              placeholder="e.g. General Room, Special Room, IRCU"
              value={wardDialog?.name || ''}
              onChange={(e) => setWardDialog({ ...wardDialog, name: e.target.value })}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={!!wardDialog?.isPrivate}
                  onChange={(e) => setWardDialog({ ...wardDialog, isPrivate: e.target.checked })}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Each bed is a separate private room
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Turn ON for Special Room / IRCU (one bed per room).
                    Leave OFF for a General Room (many beds share the same space).
                  </Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start' }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWardDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveWard} disabled={!wardDialog?.name?.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* --- Bed dialog (edit + add-single) --- */}
      <Dialog open={!!bedDialog} onClose={() => setBedDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {bedDialog?.id ? `Edit ${bedDialog.bedNumber}` : `Add bed to ${bedDialog?.wardName || ''}`}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {bedDialog?.id && (
              <Alert severity={bedDialog.status === 'OCCUPIED' ? 'warning' : 'info'} icon={<HotelIcon />}>
                Status: <b>{(bedDialog.status || '').replace('_', ' ')}</b>
                {bedDialog.status === 'OCCUPIED' && ' — this bed currently has a patient.'}
              </Alert>
            )}
            <TextField
              label="Bed number *" fullWidth
              placeholder="e.g. Bed 1"
              value={bedDialog?.bedNumber || ''}
              onChange={(e) => setBedDialog({ ...bedDialog, bedNumber: e.target.value })}
              InputProps={{ readOnly: !!bedDialog?.id }}
              helperText={bedDialog?.id ? 'Bed number cannot be changed once created.' : ''}
            />
            <Autocomplete
              freeSolo
              options={BED_TYPE_SUGGESTIONS}
              value={bedDialog?.bedType || 'General'}
              onChange={(_, v) => setBedDialog({ ...bedDialog, bedType: (v || '').toString() })}
              onInputChange={(_, v, reason) => {
                if (reason === 'input') setBedDialog({ ...bedDialog, bedType: v });
              }}
              renderInput={(p) => (
                <TextField {...p} label="Bed type *" placeholder="General / Special / IRCU …" />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          {bedDialog?.id && (
            <Button
              color="error" onClick={removeBed}
              disabled={bedDialog.status === 'OCCUPIED'}
              sx={{ mr: 'auto' }}
            >
              Delete
            </Button>
          )}
          <Button onClick={() => setBedDialog(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveBed} disabled={!bedDialog?.bedNumber?.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* --- Bulk-add dialog --- */}
      <Dialog open={!!bulkDialog} onClose={() => setBulkDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Bulk add beds to {bulkDialog?.wardName || ''}</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Creates <b>{Number(bulkDialog?.count) || 0}</b> beds. Numbers are generated as
            {' '}<code>{bulkDialog?.prefix || ''}{String(Number(bulkDialog?.startNumber) || 1).padStart(Number(bulkDialog?.padWidth) || 1, '0')}</code>,
            {' '}<code>{bulkDialog?.prefix || ''}{String((Number(bulkDialog?.startNumber) || 1) + 1).padStart(Number(bulkDialog?.padWidth) || 1, '0')}</code>, …
            {' '}Duplicates are skipped silently.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                freeSolo
                options={BED_TYPE_SUGGESTIONS}
                value={bulkDialog?.bedType || 'General'}
                onChange={(_, v) => setBulkDialog({ ...bulkDialog, bedType: (v || '').toString() })}
                onInputChange={(_, v, reason) => {
                  if (reason === 'input') setBulkDialog({ ...bulkDialog, bedType: v });
                }}
                renderInput={(p) => (
                  <TextField {...p} label="Bed type *" placeholder="General / Special / IRCU" />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Number of beds *"
                type="number" inputProps={{ min: 1, max: 500, step: 1 }}
                value={bulkDialog?.count ?? 7}
                onChange={(e) => setBulkDialog({ ...bulkDialog, count: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Prefix"
                placeholder="Bed  /  Room "
                value={bulkDialog?.prefix ?? ''}
                onChange={(e) => setBulkDialog({ ...bulkDialog, prefix: e.target.value })}
                helperText="Text before the number."
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth label="Start number"
                type="number" inputProps={{ min: 1, step: 1 }}
                value={bulkDialog?.startNumber ?? 1}
                onChange={(e) => setBulkDialog({ ...bulkDialog, startNumber: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDialog(null)}>Cancel</Button>
          <Button
            variant="contained" onClick={bulkCreate}
            disabled={bulkSaving || !bulkDialog?.count || Number(bulkDialog.count) < 1}
          >
            {bulkSaving ? <CircularProgress size={18} color="inherit" /> : 'Create beds'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
