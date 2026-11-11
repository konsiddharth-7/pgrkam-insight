import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/db.js';

const [, , email, password, ...nameParts] = process.argv;
const name = nameParts.join(' ') || 'Admin';

if (!email || !password) {
  console.error('Usage: npm run create-admin -- <email> <password> [name]');
  process.exit(1);
}
if (password.length < 8 || password.length > 72) {
  console.error('Password must be between 8 and 72 characters.');
  process.exit(1);
}

const cleanEmail = email.trim().toLowerCase();

try {
  const existing = await prisma.users.findUnique({ where: { email: cleanEmail } });

  if (existing) {
    await prisma.users.update({
      where: { id: existing.id },
      data: { role: 'admin' },
    });
    console.log(`Existing user ${cleanEmail} is now an admin (password unchanged).`);
  } else {
    const password_hash = await bcrypt.hash(password, 12);
    await prisma.users.create({
      data: { name, email: cleanEmail, password_hash, role: 'admin' },
    });
    console.log(`Admin created: ${cleanEmail}`);
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}