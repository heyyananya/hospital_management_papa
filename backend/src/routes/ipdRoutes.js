const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/ipdController');

router.use(auth);

/* Wards + Beds masters — admin edits, everyone reads. */
router.get('/wards',        c.listWards);
router.post('/wards',       rbac('ADMIN'), c.createWard);
router.put('/wards/:id',    rbac('ADMIN'), c.updateWard);
router.delete('/wards/:id', rbac('ADMIN'), c.removeWard);

router.get('/beds',         c.listBeds);
router.post('/beds',        rbac('ADMIN'), c.createBed);
router.post('/beds/bulk',   rbac('ADMIN'), c.bulkCreateBeds);
router.put('/beds/:id',     rbac('ADMIN'), c.updateBed);
router.delete('/beds/:id',  rbac('ADMIN'), c.removeBed);

/* Admissions */
router.get('/admissions',           c.listAdmissions);
router.get('/admissions/:id',       c.getAdmission);

// Doctor (ADMIN) requests admission from the visit page.
router.post('/admissions',          rbac('ADMIN'),               c.requestAdmission);

// Reception assigns bed / discharges patient.
router.post('/admissions/:id/assign-bed', rbac('ADMIN', 'RECEPTIONIST'), c.assignBed);
router.post('/admissions/:id/discharge',  rbac('ADMIN', 'RECEPTIONIST'), c.discharge);
router.post('/admissions/:id/cancel',     rbac('ADMIN', 'RECEPTIONIST'), c.cancel);

/* Indoor sheet — vitals chart tied to an admission. */
// Rolling admin dashboard — declared before the /:id routes so they don't
// shadow it (Express matches "indoor-sheet" as an id otherwise).
router.get   ('/indoor-sheet/recent',       rbac('ADMIN'), c.recentIndoorSheets);
router.get   ('/indoor-sheet/recent-count', rbac('ADMIN'), c.recentIndoorSheetCount);
router.get   ('/admissions/:id/indoor-sheet',       c.getIndoorSheet);
router.put   ('/admissions/:id/indoor-sheet',       rbac('ADMIN', 'RECEPTIONIST'), c.saveIndoorSheet);
router.delete('/admissions/:id/indoor-sheet/day',   rbac('ADMIN', 'RECEPTIONIST'), c.deleteIndoorSheetDay);
router.get   ('/admissions/:id/indoor-sheet/pdf',   c.printIndoorSheet);

module.exports = router;
