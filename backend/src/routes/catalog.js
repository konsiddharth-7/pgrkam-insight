import { Router } from 'express';
import prisma from '../db.js';
import {
  DISTRICTS,
  GENDERS,
  EDUCATION_LEVELS,
  JOB_CATEGORIES,
} from '../constants/options.js';

const router = Router();

// GET /api/options (public)
router.get('/options', (req, res) => {
  res.status(200).json({
    districts: DISTRICTS,
    genders: GENDERS,
    education_levels: EDUCATION_LEVELS,
    job_categories: JOB_CATEGORIES,
  });
});

// GET /api/skills (public)
router.get('/skills', async (req, res) => {
  const skills = await prisma.skills.findMany({
    select: { id: true, skill_name: true, category: true },
    orderBy: [{ category: 'asc' }, { skill_name: 'asc' }],
  });
  res.status(200).json({ skills });
});

export default router;