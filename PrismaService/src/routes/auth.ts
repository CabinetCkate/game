import { Router } from 'express';
import {prisma,HttpError} from '../prisma';
export const auth=Router();
auth.post('/register',async(req,res,next)=>{try{
 const {email,passwordHash,firstName,lastName}=req.body;
 const user=await prisma.user.create({data:{email,passwordHash,student:{create:{firstName,lastName}}},include:{student:true}});res.json(user);
}catch(e){next(e);}});
auth.post('/find',async(req,res,next)=>{try{res.json(await prisma.user.findUnique({where:{email:req.body.email},include:{student:true}})??{});}catch(e){next(e);}});
auth.post('/token',async(req,res,next)=>{try{await prisma.refreshToken.create({data:{...req.body,expiresAt:new Date(req.body.expiresAt)}});res.json({ok:true});}catch(e){next(e);}});
auth.post('/rotate',async(req,res,next)=>{try{
 const user=await prisma.$transaction(async tx=>{
  const token=await tx.refreshToken.findUnique({where:{tokenHash:req.body.tokenHash},include:{user:{include:{student:true}}}});
  if(!token||token.revokedAt||token.expiresAt<new Date())throw new HttpError(401,'Refresh token expired.');
  const revoked=await tx.refreshToken.updateMany({where:{id:token.id,revokedAt:null},data:{revokedAt:new Date()}});
  if(revoked.count!==1)throw new HttpError(401,'Refresh token already used.');
  await tx.refreshToken.create({data:{userId:token.userId,tokenHash:req.body.newTokenHash,expiresAt:token.expiresAt}});return token.user;
 });res.json(user);
}catch(e){next(e);}});
auth.post('/revoke',async(req,res,next)=>{try{await prisma.refreshToken.updateMany({where:{tokenHash:req.body.tokenHash},data:{revokedAt:new Date()}});res.json({ok:true});}catch(e){next(e);}});
auth.post('/forgot',async(req,res,next)=>{try{
 const user=await prisma.user.findUnique({where:{email:req.body.email}});
 if(user)await prisma.passwordResetToken.create({data:{userId:user.id,tokenHash:req.body.tokenHash,expiresAt:new Date(Date.now()+1800000)}});
 res.json({found:!!user});
}catch(e){next(e);}});
auth.post('/reset',async(req,res,next)=>{try{
 await prisma.$transaction(async tx=>{
  const token=await tx.passwordResetToken.findUnique({where:{tokenHash:req.body.tokenHash}});
  if(!token||token.usedAt||token.expiresAt<new Date())throw new HttpError(400,'Reset link expired or used.');
  const used=await tx.passwordResetToken.updateMany({where:{id:token.id,usedAt:null},data:{usedAt:new Date()}});
  if(used.count!==1)throw new HttpError(400,'Reset link already used.');
  await tx.user.update({where:{id:token.userId},data:{passwordHash:req.body.passwordHash}});
  await tx.refreshToken.updateMany({where:{userId:token.userId,revokedAt:null},data:{revokedAt:new Date()}});
 });res.json({message:'Password updated. Sign in with your new password.'});
}catch(e){next(e);}});
