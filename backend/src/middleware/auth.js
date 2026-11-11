import prisma from '../db.js';
import { verifyToken } from '../utils/jwt.js';

// Requires a valid "Authorization: Bearer <token>" header.
// On success, sets req.user = { id, name, email, role, created_at }.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, created_at: true },
  });

  if (!user) {
    return res.status(401).json({ error: 'User no longer exists' });
  }

  req.user = user;
  next();
}

// Use AFTER requireAuth. Example: requireRole('admin', 'employer')
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
}

export const requireAdmin = requireRole('admin');