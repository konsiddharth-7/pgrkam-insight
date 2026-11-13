import 'dotenv/config';
import prisma from '../src/db.js';

const SKILLS = [
  // IT & Software
  ['JavaScript', 'IT & Software'],
  ['Python', 'IT & Software'],
  ['Java', 'IT & Software'],
  ['C++', 'IT & Software'],
  ['SQL', 'IT & Software'],
  ['HTML & CSS', 'IT & Software'],
  ['React', 'IT & Software'],
  ['Node.js', 'IT & Software'],
  ['Computer Basics', 'IT & Software'],

  // Office & Admin
  ['MS Excel', 'Office & Admin'],
  ['MS Word', 'Office & Admin'],
  ['Typing', 'Office & Admin'],
  ['Data Entry', 'Office & Admin'],
  ['Tally', 'Office & Admin'],
  ['Accounting', 'Office & Admin'],

  // Teaching
  ['Classroom Management', 'Teaching'],
  ['Curriculum Planning', 'Teaching'],
  ['Mathematics', 'Teaching'],
  ['English Teaching', 'Teaching'],
  ['Punjabi Language', 'Teaching'],
  ['Hindi Language', 'Teaching'],

  // Healthcare
  ['Patient Care', 'Healthcare'],
  ['First Aid', 'Healthcare'],
  ['Nursing', 'Healthcare'],
  ['Pharmacy Basics', 'Healthcare'],
  ['Lab Technician', 'Healthcare'],

  // Manufacturing and skilled trades
  ['Welding', 'Manufacturing'],
  ['Electrical Wiring', 'Manufacturing'],
  ['CNC Operation', 'Manufacturing'],
  ['Machine Operation', 'Manufacturing'],
  ['Quality Inspection', 'Manufacturing'],
  ['Plumbing', 'Construction'],
  ['Carpentry', 'Construction'],

  // Sales and service
  ['Customer Service', 'Retail & Sales'],
  ['Sales', 'Retail & Sales'],
  ['Marketing', 'Retail & Sales'],
  ['Cash Handling', 'Retail & Sales'],

  // Agriculture
  ['Farm Management', 'Agriculture'],
  ['Tractor Operation', 'Agriculture'],

  // General
  ['Communication', 'General'],
  ['Teamwork', 'General'],
  ['Leadership', 'General'],
  ['Problem Solving', 'General'],
  ['General Knowledge', 'General'],
  ['Driving (Light Vehicle)', 'General'],
];

try {
  const result = await prisma.skills.createMany({
    data: SKILLS.map(([skill_name, category]) => ({ skill_name, category })),
    skipDuplicates: true, // safe to run many times
  });
  const total = await prisma.skills.count();
  console.log(`Added ${result.count} new skills. Total skills in database: ${total}`);
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}