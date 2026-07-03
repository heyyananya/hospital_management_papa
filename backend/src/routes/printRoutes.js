const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const upload = require('../middlewares/upload');
const c = require('../controllers/printController');

router.use(auth);

// Official bill (Auto or Final) - this is the primary print endpoint.
router.get('/bill/:id', rbac('ADMIN', 'RECEPTIONIST'), c.printBill);

// Legacy receipt endpoints (kept for backward compatibility).
router.get('/receipt/consultation/:visitId', rbac('ADMIN', 'RECEPTIONIST'), c.consultationReceipt);
router.get('/receipt/charges/:visitId',      rbac('ADMIN', 'RECEPTIONIST'), c.chargesReceipt);

router.get('/prescription/:visitId', rbac('ADMIN'), c.prescription);
router.post(
  '/letterpad',
  rbac('ADMIN'),
  upload.single('file'),
  c.uploadLetterpad
);

module.exports = router;
