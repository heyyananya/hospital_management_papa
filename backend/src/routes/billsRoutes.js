const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/billsController');

router.use(auth);

// Read is open to Admin + Receptionist.
router.get('/auto',  rbac('ADMIN', 'RECEPTIONIST'), c.listAuto);
router.get('/final', rbac('ADMIN', 'RECEPTIONIST'), c.listFinal);
router.get('/ipd',   rbac('ADMIN', 'RECEPTIONIST'), c.listIpd);

// IPD "Make a Bill" — empty bill seeded from an admission. Must come before
// the /:id route below, otherwise Express routes /ipd/from-admission/:aId
// into the generic bill-by-id handler.
router.post('/ipd/from-admission/:admissionId',
  rbac('ADMIN', 'RECEPTIONIST'), c.createIpd);

router.get('/:id',   rbac('ADMIN', 'RECEPTIONIST'), c.get);

// Final bill workflow.
router.post('/:id/convert', rbac('ADMIN', 'RECEPTIONIST'), c.convertToFinal);
router.put('/:id',          rbac('ADMIN', 'RECEPTIONIST'), c.updateFinal);
router.post('/:id/lock',    rbac('ADMIN', 'RECEPTIONIST'), c.lockFinal);

module.exports = router;
