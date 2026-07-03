const router = require('express').Router();
const auth = require('../middlewares/auth');
const rbac = require('../middlewares/rbac');
const c = require('../controllers/diseaseTemplateController');

router.use(auth);

// Reads are open to any signed-in user (doctor form needs them).
router.get('/',             c.listDiseases);
router.get('/:diseaseId',   c.getTemplates);

// Only admin can edit the templates.
router.put('/:diseaseId', rbac('ADMIN'), c.replaceTemplates);

module.exports = router;
