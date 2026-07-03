const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const upload = require('../middlewares/upload');
const c = require('../controllers/reportController');

router.use(auth);

router.post(
  '/upload',
  rbac('ADMIN'),
  upload.single('file'),
  c.upload
);

router.get('/patient/:patientId', rbac('ADMIN', 'MEDICAL_OFFICER'), c.listForPatient);
router.delete('/:id',             rbac('ADMIN'), c.remove);

module.exports = router;
