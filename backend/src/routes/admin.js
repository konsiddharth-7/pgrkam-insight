import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Everything in this file requires a logged-in admin
router.use(requireAuth, requireAdmin);

router.get('/ping', (req, res) => {
  res.status(200).json({ status: 'ok', message: `Hello admin ${req.user.name}` });
});

export default router;