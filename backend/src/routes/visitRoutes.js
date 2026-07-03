const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/visitController');

router.use(auth);

router.get('/search', rbac('ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'), c.search);
router.get('/:id',    rbac('ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'), c.get);
router.post('/:id/cancel', rbac('ADMIN'), c.cancel);

module.exports = router;
