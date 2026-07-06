/**
 * Permission catalog + role helpers.
 *
 * A "permission" here is a UI capability — a sidebar entry / page a user is
 * allowed to open. The Admin toggles a user's permission set from the Users
 * → Rights dialog; the sidebar and route guards read this catalog to know
 * what to show.
 *
 * Server-side RBAC (role) is still the security boundary. Permissions are a
 * usability layer on top: they can only *hide* things from a non-admin user,
 * never grant a non-admin something their role doesn't already allow.
 *
 * Adding a new sidebar page? Two steps:
 *   1. Add a row to PERMISSIONS with a unique key, label, group, and path.
 *   2. Add the key to ROLE_DEFAULTS[<role>] for any role that should get the
 *      page by default. If the role MUST always keep it, also list the key
 *      in PERMANENT_BY_ROLE[<role>].
 *
 * The Rights dialog auto-picks the new entry up because it lists every
 * catalog row for every non-admin user.
 */

// Full catalog — order here drives the display order in the Rights dialog.
// `group` matches sidebar sections; `path` matches the sidebar `to` string.
export const PERMISSIONS = [
  { key: 'dashboard',         label: 'Dashboard',            group: 'Overview',
    path: '/' },

  { key: 'patients.new',      label: 'Register Patient',     group: 'Patients',
    path: '/patients/new' },
  { key: 'patients.search',   label: 'Patients (Search)',    group: 'Patients',
    path: '/patients/search' },
  { key: 'patients.attended', label: 'Patients Attended',    group: 'Patients',
    path: '/mo/stats' },

  { key: 'mo.queue',          label: 'MO Queue',             group: 'Clinical Queues',
    path: '/mo' },
  { key: 'doctor.queue',      label: 'Doctor Queue',         group: 'Clinical Queues',
    path: '/doctor' },

  { key: 'visits.list',       label: 'All Visits',           group: 'Records & Billing',
    path: '/visits' },
  { key: 'bills.auto',        label: 'Auto Generated Bills', group: 'Records & Billing',
    path: '/bills/auto' },
  { key: 'registers.3c',      label: '3C Register OPD',      group: 'Records & Billing',
    path: '/registers/3c' },
  { key: 'registers.3c-ipd',  label: '3C Register IPD',      group: 'Records & Billing',
    path: '/registers/3c-ipd' },

  { key: 'services',          label: 'Services & Prices',    group: 'Masters',
    path: '/services' },
  { key: 'masters',           label: 'Other Masters',        group: 'Masters',
    path: '/masters' },
  { key: 'disease-templates', label: 'Disease Medicines',    group: 'Masters',
    path: '/disease-templates' },
  { key: 'wards-beds',        label: 'Rooms Master',         group: 'Masters',
    path: '/wards-beds' },

  { key: 'ipd.pending',       label: 'Pending Admissions',   group: 'IPD',
    path: '/ipd/pending' },
  { key: 'ipd.patients',      label: 'IPD Patients',         group: 'IPD',
    path: '/ipd/patients' },
  { key: 'ipd.discharged',    label: 'Discharged Patients',  group: 'IPD',
    path: '/ipd/discharged' },
  { key: 'ipd.indoor-recent', label: 'Recent Indoor Sheets', group: 'IPD',
    path: '/ipd/indoor-sheet/recent' },

  { key: 'reminders',         label: 'Reminders',            group: 'Administration',
    path: '/reminders' },
  { key: 'users',             label: 'Users & Rights',       group: 'Administration',
    path: '/users' },
  { key: 'settings',          label: 'Settings',             group: 'Administration',
    path: '/settings' },
];

export const PERMISSION_BY_KEY  = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p]));
export const PERMISSION_BY_PATH = Object.fromEntries(PERMISSIONS.map((p) => [p.path, p]));

// Every catalog key — handy for the Rights dialog (which lists them all).
export const ALL_KEYS = PERMISSIONS.map((p) => p.key);

// Keys the role always keeps — the UI shows these as locked-on checkboxes so
// admin can't accidentally remove a page the role NEEDS to work (e.g. an MO
// without MO Queue is useless).
export const PERMANENT_BY_ROLE = {
  ADMIN: ALL_KEYS,
  MEDICAL_OFFICER: ['dashboard', 'mo.queue'],
  RECEPTIONIST: ['dashboard'],
};

// The default checked set for a fresh user of that role.
export const ROLE_DEFAULTS = {
  ADMIN: ALL_KEYS,
  MEDICAL_OFFICER: [
    'dashboard', 'mo.queue', 'patients.attended',
    'patients.new', 'patients.search',
  ],
  RECEPTIONIST: [
    'dashboard',
    'patients.new', 'patients.search',
    'visits.list', 'bills.auto',
    'registers.3c', 'registers.3c-ipd',
    'services', 'wards-beds',
    'ipd.pending', 'ipd.patients', 'ipd.discharged',
    'settings',
  ],
};

/**
 * Effective permission list. Admins always get everything (defence in depth
 * — even a corrupted DB row can't lock the admin out of admin pages). For
 * other roles: NULL / undefined stored → use role defaults; otherwise use
 * the stored list, unioned with the permanent keys so a stale save can't
 * kill a page the role needs.
 *
 * Also tolerates the older CRUD-object storage format (from the brief
 * matrix experiment) by treating any key whose stored value evaluates to
 * truthy as granted. That means old rows keep working after this revert.
 */
export const effectivePermissions = (user) => {
  if (!user) return [];
  if (user.role === 'ADMIN') return ALL_KEYS;

  const permanent = PERMANENT_BY_ROLE[user.role] || [];
  const stored = user.permissions;

  let source;
  if (Array.isArray(stored) && stored.length) {
    source = stored;
  } else if (stored && typeof stored === 'object') {
    // Legacy CRUD-matrix format: { key: {c,r,u,d} } or { key: 'cru' }.
    source = Object.entries(stored)
      .filter(([, v]) => {
        if (!v) return false;
        if (typeof v === 'string') return v.length > 0;
        if (typeof v === 'object') return Object.values(v).some(Boolean);
        return !!v;
      })
      .map(([k]) => k);
  } else {
    source = ROLE_DEFAULTS[user.role] || [];
  }
  return Array.from(new Set([...source, ...permanent]));
};

export const hasPermission = (user, key) => effectivePermissions(user).includes(key);
