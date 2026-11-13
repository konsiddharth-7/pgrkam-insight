import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { DISTRICTS, JOB_CATEGORIES } from '../constants/options.js';
import { validationError, parseId } from '../utils/http.js';
import {
  JOB_INCLUDE,
  shapeJob,
  listSchema,
  listJobs,
  jobSkillsSchema,
  findUnknownSkillIds,
  checkSalary,
} from '../utils/jobs.js';

const router = Router();

// Every route in this file needs a logged-in admin
router.use(requireAuth, requireAdmin);

// ---------- Validation ----------
const salary = z.number().int().min(0).max(10_000_000).nullable().optional();

const fields = {
  title: z.string().trim().min(3).max(150),
  company: z.string().trim().min(2).max(150),
  description: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  location: z.enum(DISTRICTS).nullable().optional(),
  salary_min: salary,
  salary_max: salary,
  experience_required: z
    .number()
    .min(0)
    .max(60)
    .transform((v) => Math.round(v * 10) / 10)
    .nullable()
    .optional(),
  category: z.enum(JOB_CATEGORIES).nullable().optional(),
  status: z.enum(['open', 'closed']).optional(),
  skills: jobSkillsSchema.optional(),
};

// Create: title and company are required. Update: every field is optional.
const createSchema = z.strictObject(fields);
const updateSchema = z.strictObject(fields).partial();

const adminListSchema = listSchema.extend({
  status: z.enum(['open', 'closed', 'all']).default('all'),
});

async function loadJob(id) {
  return prisma.jobs.findUnique({ where: { id }, include: JOB_INCLUDE });
}

function unknownSkillsResponse(res, unknown) {
  return res.status(400).json({
    error: 'Invalid input',
    details: [{ field: 'skills', message: `Unknown skill_id: ${unknown.join(', ')}` }],
  });
}

// ---------- GET /api/admin/jobs ----------
router.get('/', async (req, res) => {
  const parsed = adminListSchema.safeParse(req.query);
  if (!parsed.success) return validationError(res, parsed.error);

  const { status, ...filters } = parsed.data;
  const result = await listJobs(filters, status === 'all' ? undefined : status);
  res.status(200).json(result);
});

// ---------- GET /api/admin/jobs/:id ----------
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid job id' });

  const job = await loadJob(id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.status(200).json({ job: shapeJob(job) });
});

// ---------- POST /api/admin/jobs ----------
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { skills, ...data } = parsed.data;

  const salaryProblem = checkSalary(data.salary_min, data.salary_max);
  if (salaryProblem) {
    return res.status(400).json({
      error: 'Invalid input',
      details: [{ field: 'salary_min', message: salaryProblem }],
    });
  }

  if (skills?.length) {
    const unknown = await findUnknownSkillIds(skills);
    if (unknown.length > 0) return unknownSkillsResponse(res, unknown);
  }

  // The job and its skills are created together in one operation
  const job = await prisma.jobs.create({
    data: {
      ...data,
      employer_id: req.user.id,
      ...(skills?.length
        ? {
            job_skills: {
              create: skills.map((s) => ({
                skill_id: s.skill_id,
                importance: s.importance,
              })),
            },
          }
        : {}),
    },
    include: JOB_INCLUDE,
  });

  res.status(201).json({ job: shapeJob(job) });
});

// ---------- PUT /api/admin/jobs/:id ----------
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid job id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const existing = await prisma.jobs.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Job not found' });

  const { skills, ...data } = parsed.data;

  // Check the salary range using the new values mixed with the stored ones
  const newMin = 'salary_min' in data ? data.salary_min : existing.salary_min;
  const newMax = 'salary_max' in data ? data.salary_max : existing.salary_max;
  const salaryProblem = checkSalary(newMin, newMax);
  if (salaryProblem) {
    return res.status(400).json({
      error: 'Invalid input',
      details: [{ field: 'salary_min', message: salaryProblem }],
    });
  }

  if (skills !== undefined && skills.length > 0) {
    const unknown = await findUnknownSkillIds(skills);
    if (unknown.length > 0) return unknownSkillsResponse(res, unknown);
  }

  await prisma.$transaction(async (tx) => {
    if (skills !== undefined) {
      await tx.job_skills.deleteMany({ where: { job_id: id } });
      if (skills.length > 0) {
        await tx.job_skills.createMany({
          data: skills.map((s) => ({
            job_id: id,
            skill_id: s.skill_id,
            importance: s.importance,
          })),
        });
      }
    }
    if (Object.keys(data).length > 0) {
      await tx.jobs.update({ where: { id }, data });
    }
  });

  const job = await loadJob(id);
  res.status(200).json({ job: shapeJob(job) });
});

export default router;