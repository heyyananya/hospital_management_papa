const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/billingController');

router.use(auth);

// Admin + Receptionist can view/manage charges. MO can view (read-only).
router.get('/visit/:visitId',  rbac('ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'), c.list);
router.post('/visit/:visitId', rbac('ADMIN', 'RECEPTIONIST'), c.add);
router.delete('/:id',          rbac('ADMIN', 'RECEPTIONIST'), c.remove);

module.exports = router;
