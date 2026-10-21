import '../src/environment';
import { PrismaClient } from '@prisma/client';
import { seedShowBank } from './show-bank';
import { seedPreparedSubjects } from './show-subjects';

const prisma=new PrismaClient();
async function main() {
  await seedShowBank(prisma);
  await seedPreparedSubjects(prisma);
  console.log('Prepared show courses updated: 6 subjects, 86 authored questions, ru/kk/en. User data preserved.');
}
main().catch(error=>{console.error('Unable to update prepared bank:',error.name);process.exitCode=1;}).finally(()=>prisma.$disconnect());
