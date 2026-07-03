const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/reminderController');

router.use(auth);

// Any logged-in user can read reminders (bell icon shows active ones).
router.get('/', c.list);

// Only ADMIN can manage them.
router.post('/',                 rbac('ADMIN'), c.create);
router.put('/:id',               rbac('ADMIN'), c.update);
router.post('/:id/complete',     rbac('ADMIN'), c.complete);
router.post('/:id/uncomplete',   rbac('ADMIN'), c.uncomplete);
router.delete('/:id',            rbac('ADMIN'), c.remove);

module.exports = router;
