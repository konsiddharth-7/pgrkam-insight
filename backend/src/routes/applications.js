import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validationError, parseId } from '../utils/http.js';
import {
  STATUSES,
  APPLICATION_INCLUDE,
  shapeApplication,
} from '../utils/applications.js';

const router = Router();

// Every route in this file needs a logged-in candidate
router.use(requireAuth, requireRole('candidate'));

// ---------- Validation ----------
// strictObject rejects unknown fields, so a candidate cannot send "status"
const applySchema = z.strictObject({
  job_id: z.number().int().positive().max(2147483647),
  recommendation_id: z.number().int().positive().max(2147483647).nullable().optional(),
});

const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ---------- POST /api/applications ----------
router.post('/', async (req, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { job_id, recommendation_id } = parsed.data;
  const userId = req.user.id;

  const job = await prisma.jobs.findUnique({
    where: { id: job_id },
    select: { id: true, status: true },
  });
  if (!job || job.status !== 'open') {
    return res.status(404).json({ error: 'Job not found or no longer open' });
  }

  // A recommendation must belong to this user and this job
  if (recommendation_id) {
    const rec = await prisma.recommendations.findUnique({
      where: { id: recommendation_id },
      select: { user_id: true, job_id: true },
    });
    if (!rec || rec.user_id !== userId || rec.job_id !== job_id) {
      return res.status(400).json({
        error: 'Invalid input',
        details: [
          {
            field: 'recommendation_id',
            message: 'Recommendation does not match this user and job',
          },
        ],
      });
    }
  }

  try {
    // The application and its recommendation event are saved together
    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.applications.create({
        data: { user_id: userId, job_id, recommendation_id: recommendation_id ?? null },
        include: APPLICATION_INCLUDE,
      });
      if (recommendation_id) {
        await tx.recommendation_events.create({
          data: { recommendation_id, event_type: 'applied' },
        });
      }
      return created;
    });

    return res.status(201).json({ application: shapeApplication(application) });
  } catch (err) {
    // P2002 = unique constraint failed (already applied to this job)
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'You have already applied to this job' });
    }
    throw err;
  }
});

// ---------- GET /api/applications ----------
router.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed.error);

  const { status, page, limit } = parsed.data;
  const where = { user_id: req.user.id };
  if (status) where.status = status;

  const [rows, total] = await Promise.all([
    prisma.applications.findMany({
      where,
      orderBy: [{ applied_at: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: APPLICATION_INCLUDE,
    }),
    prisma.applications.count({ where }),
  ]);

  res.status(200).json({
    applications: rows.map(shapeApplication),
    pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

// ---------- DELETE /api/applications/:id (withdraw) ----------
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid application id' });

  const userId = req.user.id;

  const outcome = await prisma.$transaction(async (tx) => {
    const app = await tx.applications.findFirst({ where: { id, user_id: userId } });
    if (!app) return 'not_found';

    // Only delete if the status is STILL "Applied" at this moment
    const removed = await tx.applications.deleteMany({
      where: { id, user_id: userId, status: 'Applied' },
    });
    if (removed.count === 0) return 'locked';

    // Keep recommendation counts consistent
    if (app.recommendation_id) {
      await tx.recommendation_events.deleteMany({
        where: { recommendation_id: app.recommendation_id, event_type: 'applied' },
      });
    }
    return 'ok';
  });

  if (outcome === 'not_found') {
    return res.status(404).json({ error: 'Application not found' });
  }
  if (outcome === 'locked') {
    return res.status(409).json({
      error: 'Only applications that are still "Applied" can be withdrawn',
    });
  }
  res.status(200).json({ status: 'withdrawn', id });
});

export default router;