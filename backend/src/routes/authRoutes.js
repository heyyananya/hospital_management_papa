const router = require('express').Router();
const rateLimit = require('express-rate-limit');

const auth = require('../middlewares/auth');
const controller = require('../controllers/authController');

// Tight limiter on the login endpoint to slow brute-force attempts.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, controller.login);
router.get('/me', auth, controller.me);
router.post('/logout', auth, controller.logout);
// Same rate limit as login — this is a brute-force target too.
router.post('/verify', loginLimiter, auth, controller.verifyPassword);

module.exports = router;
