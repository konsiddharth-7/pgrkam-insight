import { Router } from 'express';
import prisma from '../db.js';
import { validationError, parseId } from '../utils/http.js';
import { JOB_INCLUDE, shapeJob, listSchema, listJobs } from '../utils/jobs.js';

const router = Router();

// GET /api/jobs  (public, open jobs only)
router.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed.error);

  const result = await listJobs(parsed.data, 'open');
  res.status(200).json(result);
});

// GET /api/jobs/:id  (public, open jobs only)
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid job id' });

  const job = await prisma.jobs.findUnique({ where: { id }, include: JOB_INCLUDE });
  if (!job || job.status !== 'open') {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.status(200).json({ job: shapeJob(job) });
});

export default router;