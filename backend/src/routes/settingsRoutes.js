const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const upload = require('../middlewares/upload');
const c = require('../controllers/settingsController');

// Logo is public (used inline on receipts/headers) - no auth.
router.get('/logo', c.getLogo);

router.use(auth);

router.get('/',         rbac('ADMIN', 'RECEPTIONIST', 'MEDICAL_OFFICER'), c.get);
router.put('/',         rbac('ADMIN', 'RECEPTIONIST'), c.update);
router.post('/logo',    rbac('ADMIN', 'RECEPTIONIST'), upload.single('file'), c.uploadLogo);

module.exports = router;
