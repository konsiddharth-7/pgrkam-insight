import { Router } from 'express';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { parseId } from '../utils/http.js';
import { JOB_INCLUDE, shapeJob } from '../utils/jobs.js';

const router = Router();

// Every route in this file needs a logged-in candidate
router.use(requireAuth, requireRole('candidate'));

// GET /api/saved-jobs
router.get('/', async (req, res) => {
  const rows = await prisma.saved_jobs.findMany({
    where: { user_id: req.user.id },
    orderBy: { saved_at: 'desc' },
    take: 100,
    include: { jobs: { include: JOB_INCLUDE } },
  });

  res.status(200).json({
    saved_jobs: rows.map((r) => ({
      saved_at: r.saved_at,
      job: shapeJob(r.jobs, { withDescription: false }),
    })),
  });
});

// POST /api/saved-jobs/:jobId  (201 = newly saved, 200 = was already saved)
router.post('/:jobId', async (req, res) => {
  const jobId = parseId(req.params.jobId);
  if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

  const job = await prisma.jobs.findUnique({
    where: { id: jobId },
    select: { id: true, status: true },
  });
  if (!job || job.status !== 'open') {
    return res.status(404).json({ error: 'Job not found' });
  }

  try {
    await prisma.saved_jobs.create({ data: { user_id: req.user.id, job_id: jobId } });
    return res.status(201).json({ status: 'saved', job_id: jobId });
  } catch (err) {
    // P2002 = unique constraint failed (already saved)
    if (err.code === 'P2002') {
      return res.status(200).json({ status: 'already_saved', job_id: jobId });
    }
    throw err;
  }
});

// DELETE /api/saved-jobs/:jobId
router.delete('/:jobId', async (req, res) => {
  const jobId = parseId(req.params.jobId);
  if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

  const result = await prisma.saved_jobs.deleteMany({
    where: { user_id: req.user.id, job_id: jobId },
  });
  res.status(200).json({ status: 'removed', removed: result.count > 0, job_id: jobId });
});

export default router;