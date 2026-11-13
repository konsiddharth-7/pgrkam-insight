import { z } from 'zod';
import prisma from '../db.js';
import { DISTRICTS, JOB_CATEGORIES } from '../constants/options.js';

// ---------- Query parameters for listing ----------
export const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.enum(JOB_CATEGORIES).optional(),
  location: z.enum(DISTRICTS).optional(),
  min_salary: z.coerce.number().int().min(0).optional(),
  max_experience: z.coerce.number().min(0).max(60).optional(),
  skill_id: z.coerce.number().int().positive().max(2147483647).optional(),
  sort: z.enum(['newest', 'salary_desc']).default('newest'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ---------- Skills attached to a job ----------
export const jobSkillsSchema = z
  .array(
    z.strictObject({
      skill_id: z.number().int().positive().max(2147483647),
      importance: z.number().int().min(1).max(5).default(3),
    })
  )
  .max(30)
  .refine((list) => new Set(list.map((s) => s.skill_id)).size === list.length, {
    message: 'Each skill can only appear once',
  });

// Returns the skill ids that do not exist in the database
export async function findUnknownSkillIds(skills) {
  const ids = skills.map((s) => s.skill_id);
  if (ids.length === 0) return [];
  const found = await prisma.skills.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((s) => s.id));
  return ids.filter((id) => !foundIds.has(id));
}

// Returns an error message, or null when the salary range is fine
export function checkSalary(min, max) {
  if (min != null && max != null && min > max) {
    return 'salary_min cannot be greater than salary_max';
  }
  return null;
}

// ---------- Loading and shaping ----------
export const JOB_INCLUDE = {
  job_skills: {
    include: { skills: true },
    orderBy: { importance: 'desc' },
  },
};

export function shapeJob(j, { withDescription = true } = {}) {
  const job = {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    salary_min: j.salary_min,
    salary_max: j.salary_max,
    experience_required:
      j.experience_required != null ? Number(j.experience_required) : null,
    category: j.category,
    status: j.status,
    created_at: j.created_at,
    skills: (j.job_skills ?? []).map((js) => ({
      skill_id: js.skill_id,
      skill_name: js.skills.skill_name,
      category: js.skills.category,
      importance: js.importance,
    })),
  };
  if (withDescription) job.description = j.description;
  return job;
}

// ---------- Searching ----------
// statusFilter: 'open', 'closed', or undefined (any status)
export async function listJobs(q, statusFilter) {
  const where = {};
  if (statusFilter) where.status = statusFilter;
  if (q.category) where.category = q.category;
  if (q.location) where.location = q.location;
  if (q.min_salary !== undefined) where.salary_max = { gte: q.min_salary };
  if (q.max_experience !== undefined) {
    where.experience_required = { lte: q.max_experience };
  }
  if (q.skill_id) where.job_skills = { some: { skill_id: q.skill_id } };
  if (q.search) {
    where.OR = [
      { title: { contains: q.search, mode: 'insensitive' } },
      { company: { contains: q.search, mode: 'insensitive' } },
      { description: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  const orderBy =
    q.sort === 'salary_desc'
      ? [{ salary_max: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
      : [{ created_at: 'desc' }, { id: 'desc' }];

  const [rows, total] = await Promise.all([
    prisma.jobs.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: JOB_INCLUDE,
    }),
    prisma.jobs.count({ where }),
  ]);

  return {
    jobs: rows.map((j) => shapeJob(j, { withDescription: false })),
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / q.limit)),
    },
  };
}