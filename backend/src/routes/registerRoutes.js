const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/registerController');

router.use(auth);

// Both Admin and Receptionist need the 3C register day-to-day.
router.get('/3c',        rbac('ADMIN', 'RECEPTIONIST'), c.threeCRegister);
router.get('/3c/pdf',    rbac('ADMIN', 'RECEPTIONIST'), c.threeCRegisterPdf);
router.put('/3c/amount', rbac('ADMIN', 'RECEPTIONIST'), c.setThreeCAmount);

// 3C Register IPD — manual ledger with monthly / FY-scoped serial numbers.
// pdf route declared before the /:id route so it isn't shadowed.
router.get   ('/3c-ipd/pdf',  rbac('ADMIN', 'RECEPTIONIST'), c.threeCIpdPdf);
router.get   ('/3c-ipd',      rbac('ADMIN', 'RECEPTIONIST'), c.listThreeCIpd);
router.post  ('/3c-ipd',      rbac('ADMIN', 'RECEPTIONIST'), c.createThreeCIpd);
router.put   ('/3c-ipd/:id',  rbac('ADMIN', 'RECEPTIONIST'), c.updateThreeCIpd);
router.delete('/3c-ipd/:id',  rbac('ADMIN', 'RECEPTIONIST'), c.removeThreeCIpd);

module.exports = router;
