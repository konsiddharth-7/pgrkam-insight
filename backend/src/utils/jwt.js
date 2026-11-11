import 'dotenv/config';
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 32) {
  throw new Error(
    'JWT_SECRET is missing or too short (minimum 32 characters). Check backend/.env'
  );
}

const expiresIn = process.env.JWT_EXPIRES_IN || '1d';

// The token only carries the user id (as "sub"). Role is always read from the database.
export function signToken(user) {
  return jwt.sign({}, secret, {
    subject: String(user.id),
    expiresIn,
    algorithm: 'HS256',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, secret, { algorithms: ['HS256'] });
}