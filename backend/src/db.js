import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Check backend/.env');
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const prisma = new PrismaClient({ adapter });

export default prisma;