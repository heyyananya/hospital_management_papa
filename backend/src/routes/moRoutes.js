const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/moController');

router.use(auth, rbac('ADMIN', 'MEDICAL_OFFICER'));

router.get('/queue',  c.queue);
router.get('/stats',  c.stats);
router.post('/:id',   c.save);

module.exports = router;
