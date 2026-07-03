const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/doctorController');

router.use(auth, rbac('ADMIN'));

router.get('/queue', c.queue);
router.post('/:id',  c.save);

module.exports = router;
