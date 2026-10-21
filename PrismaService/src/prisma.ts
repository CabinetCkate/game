import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
export const day = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Qyzylorda',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
export const safeTask = (t:any) => {const {correctAnswer,explanation,hint,...publicTask}=t; return publicTask;};
export async function eligible(studentId:string, taskId:string) {
  const [task,student]=await Promise.all([prisma.task.findUnique({where:{id:taskId},include:{options:{orderBy:{order:'asc'}},level:{include:{course:true}},topic:true}}),prisma.student.findUnique({where:{id:studentId}})]);
  if(!task||!student||!task.level.course.isPublished) throw new HttpError(404,'Challenge not found.');
  const previous=await prisma.level.findMany({where:{courseId:task.level.courseId,order:{lt:task.level.order}},include:{tasks:{select:{id:true}}}});
  const ids=previous.flatMap(l=>l.tasks.map(t=>t.id));
  const completed=await prisma.attempt.findMany({where:{studentId,isCorrect:true,taskId:{in:ids}},distinct:['taskId'],select:{taskId:true}});
  if(student.totalXP<task.level.requiredXP||completed.length<ids.length)throw new HttpError(403,'Complete earlier levels and earn the required XP first.');
  return {task,student};
}
