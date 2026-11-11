import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import prisma from '../db.js';
import { signToken } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const BCRYPT_ROUNDS = 12;
// Used when the email is unknown, so login takes the same time either way
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30, // max 30 register/login attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// ---------- Validation ----------
const emailField = z.string().trim().toLowerCase().pipe(z.email().max(254));

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailField,
  // bcrypt only uses the first 72 bytes, so 72 is the sensible maximum
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(72),
});

function validationError(res, error) {
  return res.status(400).json({
    error: 'Invalid input',
    details: error.issues.map((i) => ({
      field: i.path.join('.') || '(body)',
      message: i.message,
    })),
  });
}

// Only these fields are ever sent back. password_hash is never included.
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  created_at: true,
};

// ---------- POST /api/auth/register ----------
router.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { name, email, password } = parsed.data;
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const user = await prisma.users.create({
      data: { name, email, password_hash, role: 'candidate' }, // role is NOT taken from the request
      select: USER_SELECT,
    });
    return res.status(201).json({ user, token: signToken(user) });
  } catch (err) {
    // P2002 = unique constraint failed (email already registered)
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    throw err;
  }
});

// ---------- POST /api/auth/login ----------
router.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);

  const { email, password } = parsed.data;

  const found = await prisma.users.findUnique({ where: { email } });
  const passwordOk = await bcrypt.compare(
    password,
    found ? found.password_hash : DUMMY_HASH
  );

  if (!found || !passwordOk) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const user = {
    id: found.id,
    name: found.name,
    email: found.email,
    role: found.role,
    created_at: found.created_at,
  };

  return res.status(200).json({ user, token: signToken(user) });
});

// ---------- GET /api/auth/me ----------
router.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

export default router;
