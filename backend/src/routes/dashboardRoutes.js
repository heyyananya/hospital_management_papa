const router = require('express').Router();
const auth = require('../middlewares/auth');
const c = require('../controllers/dashboardController');

router.use(auth);
router.get('/', c.summary);

module.exports = router;
