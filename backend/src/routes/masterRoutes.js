const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/masterController');
const HttpError = require('../utils/HttpError');

router.use(auth);

// Reads are open to all authenticated users.
router.get('/:key', c.list);

/**
 * Mutations on master tables are admin-only, with ONE exception:
 * Receptionist may also manage the `service_master` table so they can
 * adjust prices or add new services (ECG, Injection, etc.) on the fly.
 */
const allowAdminOrServiceReception = (req, _res, next) => {
  if (req.user.role === 'ADMIN') return next();
  if (req.user.role === 'RECEPTIONIST' && req.params.key === 'service_master') return next();
  return next(new HttpError(403, 'You do not have permission to perform this action'));
};

router.post('/:key',       allowAdminOrServiceReception, c.create);
router.put('/:key/:id',    allowAdminOrServiceReception, c.update);
router.delete('/:key/:id', allowAdminOrServiceReception, c.remove);

module.exports = router;
