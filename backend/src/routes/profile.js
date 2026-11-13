import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  DISTRICTS,
  GENDERS,
  EDUCATION_LEVELS,
  JOB_CATEGORIES,
} from '../constants/options.js';

const router = Router();

// Every route in this file needs a logged-in candidate
router.use(requireAuth, requireRole('candidate'));

// ---------- Validation ----------
// Trims text; an empty string becomes null (clears the field)
const text = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

function ageIsReasonable(dateString) {
  const dob = new Date(`${dateString}T00:00:00.000Z`);
  const now = new Date();
  if (dob > now) return false;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthday =
    now.getUTCMonth() > dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age >= 14 && age <= 100;
}

const profileSchema = z.strictObject({
  education: z.enum(EDUCATION_LEVELS).nullable().optional(),
  experience_years: z
    .number()
    .min(0)
    .max(60)
    .transform((v) => Math.round(v * 10) / 10)
    .optional(),
  location: text(100), // town or city
  preferred_location: z.enum(DISTRICTS).nullable().optional(),
  preferred_category: z.enum(JOB_CATEGORIES).nullable().optional(),
  bio: text(1000),
  gender: z.enum(GENDERS).nullable().optional(),
  date_of_birth: z.iso
    .date()
    .refine(ageIsReasonable, 'Age must be between 14 and 100 years')
    .transform((s) => new Date(`${s}T00:00:00.000Z`))
    .nullable()
    .optional(),
  district: z.enum(DISTRICTS).nullable().optional(),
});

const skillsSchema = z
  .strictObject({
    skills: z
      .array(
        z.strictObject({
          skill_id: z.number().int().positive(),
          proficiency: z.number().int().min(1).max(5).default(3),
        })
      )
      .max(50),
  })
  .refine(
    (body) => new Set(body.skills.map((s) => s.skill_id)).size === body.skills.length,
    { message: 'Each skill can only appear once', path: ['skills'] }
  );

function validationError(res, error) {
  return res.status(400).json({
    error: 'Invalid input',
    details: error.issues.map((i) => ({
      field: i.path.join('.') || '(body)',
      message: i.message,
    })),
  });
}

// ---------- Helpers ----------
// Turns a database row (or nothing) into the JSON we send back
function shapeProfile(p) {
  return {
    education: p?.education ?? null,
    experience_years: p?.experience_years != null ? Number(p.experience_years) : 0,
    location: p?.location ?? null,
    preferred_location: p?.preferred_location ?? null,
    preferred_category: p?.preferred_category ?? null,
    bio: p?.bio ?? null,
    gender: p?.gender ?? null,
    date_of_birth: p?.date_of_birth ? p.date_of_birth.toISOString().slice(0, 10) : null,
    district: p?.district ?? null,
    profile_completed: p?.profile_completed ?? false,
  };
}

async function loadSkills(userId) {
  const rows = await prisma.candidate_skills.findMany({
    where: { user_id: userId },
    include: { skills: true },
    orderBy: { skills: { skill_name: 'asc' } },
  });
  return rows.map((r) => ({
    skill_id: r.skill_id,
    skill_name: r.skills.skill_name,
    category: r.skills.category,
    proficiency: r.proficiency,
  }));
}

// A profile is complete when the key fields are filled and there is at least one skill.
// Recalculated by the server every time; the client can never set it.
async function syncCompleted(userId) {
  const profile = await prisma.candidate_profiles.findUnique({ where: { user_id: userId } });
  if (!profile) return false;

  const skillCount = await prisma.candidate_skills.count({ where: { user_id: userId } });
  const complete = Boolean(
    profile.education &&
      profile.location &&
      profile.district &&
      profile.gender &&
      profile.date_of_birth &&
      skillCount > 0
  );

  if (complete !== profile.profile_completed) {
    await prisma.candidate_profiles.update({
      where: { user_id: userId },
      data: { profile_completed: complete },
    });
  }
  return complete;
}

// ---------- GET /api/profile ----------
router.get('/', async (req, res) => {
  const userId = req.user.id;
  const [profile, skills] = await Promise.all([
    prisma.candidate_profiles.findUnique({ where: { user_id: userId } }),
    loadSkills(userId),
  ]);
  res.status(200).json({ profile: shapeProfile(profile), skills });
});

// ---------- PUT /api/profile ----------
router.put('/', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const data = parsed.data;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const userId = req.user.id;

  // Creates the profile on first save, updates it afterwards
  await prisma.candidate_profiles.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...data },
    update: data,
  });

  await syncCompleted(userId);

  const [profile, skills] = await Promise.all([
    prisma.candidate_profiles.findUnique({ where: { user_id: userId } }),
    loadSkills(userId),
  ]);
  res.status(200).json({ profile: shapeProfile(profile), skills });
});

// ---------- PUT /api/profile/skills ----------
// Replaces the whole skill list. Send an empty array to remove all skills.
router.put('/skills', async (req, res) => {
  const parsed = skillsSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const userId = req.user.id;
  const { skills } = parsed.data;

  // Make sure every skill_id exists
  const ids = skills.map((s) => s.skill_id);
  const found = await prisma.skills.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((s) => s.id));
  const unknown = ids.filter((id) => !foundIds.has(id));
  if (unknown.length > 0) {
    return res.status(400).json({
      error: 'Invalid input',
      details: [{ field: 'skills', message: `Unknown skill_id: ${unknown.join(', ')}` }],
    });
  }

  // Delete the old list and insert the new one together, so we never end up half-updated
  await prisma.$transaction([
    prisma.candidate_skills.deleteMany({ where: { user_id: userId } }),
    prisma.candidate_skills.createMany({
      data: skills.map((s) => ({
        user_id: userId,
        skill_id: s.skill_id,
        proficiency: s.proficiency,
      })),
    }),
  ]);

  await syncCompleted(userId);

  const [profile, savedSkills] = await Promise.all([
    prisma.candidate_profiles.findUnique({ where: { user_id: userId } }),
    loadSkills(userId),
  ]);
  res.status(200).json({ profile: shapeProfile(profile), skills: savedSkills });
});

export default router;