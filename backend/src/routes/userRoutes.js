const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/userController');

router.use(auth, rbac('ADMIN'));

router.get('/',    c.list);
router.post('/',   c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

module.exports = router;
