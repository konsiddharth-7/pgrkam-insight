import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validationError, parseId } from '../utils/http.js';
import {
  STATUSES,
  ADMIN_APPLICATION_INCLUDE,
  shapeApplication,
  checkTransition,
} from '../utils/applications.js';

const router = Router();

// Every route in this file needs a logged-in admin
router.use(requireAuth, requireAdmin);

// ---------- Validation ----------
const idField = z.coerce.number().int().positive().max(2147483647);

const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  job_id: idField.optional(),
  user_id: idField.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const statusSchema = z.strictObject({ status: z.enum(STATUSES) });

// ---------- GET /api/admin/applications ----------
router.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed.error);

  const { status, job_id, user_id, page, limit } = parsed.data;
  const where = {};
  if (status) where.status = status;
  if (job_id) where.job_id = job_id;
  if (user_id) where.user_id = user_id;

  const [rows, total] = await Promise.all([
    prisma.applications.findMany({
      where,
      orderBy: [{ applied_at: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: ADMIN_APPLICATION_INCLUDE,
    }),
    prisma.applications.count({ where }),
  ]);

  res.status(200).json({
    applications: rows.map(shapeApplication),
    pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

// ---------- GET /api/admin/applications/:id ----------
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid application id' });

  const app = await prisma.applications.findUnique({
    where: { id },
    include: ADMIN_APPLICATION_INCLUDE,
  });
  if (!app) return res.status(404).json({ error: 'Application not found' });

  res.status(200).json({ application: shapeApplication(app) });
});

// ---------- PUT /api/admin/applications/:id/status ----------
router.put('/:id/status', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid application id' });

  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { status } = parsed.data;

  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.applications.findUnique({ where: { id } });
    if (!existing) return { code: 404, message: 'Application not found' };

    const problem = checkTransition(existing.status, status);
    if (problem) return { code: 409, message: problem };

    // Only update if nobody else changed the status in the meantime
    const changed = await tx.applications.updateMany({
      where: { id, status: existing.status },
      data: { status, updated_at: new Date() },
    });
    if (changed.count === 0) {
      return {
        code: 409,
        message: 'Application was changed by someone else. Please reload and try again.',
      };
    }

    // Placements feed the recommendation performance analytics
    if (status === 'Placed' && existing.recommendation_id) {
      await tx.recommendation_events.create({
        data: { recommendation_id: existing.recommendation_id, event_type: 'placed' },
      });
    }
    return { code: 200 };
  });

  if (outcome.code !== 200) {
    return res.status(outcome.code).json({ error: outcome.message });
  }

  const app = await prisma.applications.findUnique({
    where: { id },
    include: ADMIN_APPLICATION_INCLUDE,
  });
  res.status(200).json({ application: shapeApplication(app) });
});

export default router;