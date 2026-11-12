import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { registerUser, authenticateUser, getUserById, updateOwnProfile } from '../src/services/authService.js';
import { createProject, getProjectsForMember } from '../src/services/projectService.js';
const unique = () => new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
const missing = () => new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: 'test' });
const isCode = code => error => error.code === code;
const secret='StrongPassword123!';
const account = {id:'u1',name:'Test',email:'a@example.com',role:'MEMBER',active:true,sessionVersion:0,passwordHash:await bcrypt.hash(secret,4)};
test('registration rejects invalid input and existing accounts without creating a user', async () => {
 let writes=0;const db={user:{findUnique:async()=>account,create:async()=>{writes++}}};
 await assert.rejects(registerUser({name:'',email:'bad',password:'x'},db));
 await assert.rejects(registerUser({name:'Tester',email:'a@example.com',password:secret},db),isCode('EMAIL_IN_USE'));
 assert.equal(writes,0);
});
test('registration normalizes input, hashes password, returns only public fields and token', async () => {
 let saved;const db={user:{findUnique:async()=>null,create:async({data})=>{saved=data;return {...account,...data}}}};
 const r=await registerUser({name:'  Tester  ',email:' A@EXAMPLE.COM ',password:secret},db);
 assert.equal(saved.name,'Tester');assert.equal(saved.email,'a@example.com');assert.notEqual(saved.passwordHash,secret);assert.equal(await bcrypt.compare(secret,saved.passwordHash),true);assert.ok(r.token);assert.equal(r.user.passwordHash,undefined);
});
test('registration handles unique constraint races and propagates unrelated database errors', async () => {
 const db={user:{findUnique:async()=>null,create:async()=>{throw unique()}}};
 await assert.rejects(registerUser({name:'Tester',email:'a@example.com',password:secret},db),isCode('EMAIL_IN_USE'));
 const failure=new Error('database failure');db.user.create=async()=>{throw failure};
 await assert.rejects(registerUser({name:'Tester',email:'a@example.com',password:secret},db),e=>e===failure);
});
test('login rejects missing, excessively long, unknown, inactive and wrong credentials', async () => {
 const db={user:{findUnique:async()=>null}};
 await assert.rejects(authenticateUser({email:'',password:''},db));
 for(const input of [{email:'a'.repeat(300),password:'x'},{email:'a@example.com',password:'x'.repeat(100)}])await assert.rejects(authenticateUser(input,db),isCode('INVALID_CREDENTIALS'));
 await assert.rejects(authenticateUser({email:'a@example.com',password:secret},db),isCode('INVALID_CREDENTIALS'));
 db.user.findUnique=async()=>({...account,active:false});await assert.rejects(authenticateUser({email:'a@example.com',password:secret},db),isCode('INVALID_CREDENTIALS'));
 db.user.findUnique=async()=>account;await assert.rejects(authenticateUser({email:'a@example.com',password:'wrong'},db),isCode('INVALID_CREDENTIALS'));
});
test('successful login returns public fields, not password hash',async()=>{
 const r=await authenticateUser({email:' A@EXAMPLE.COM ',password:secret},{user:{findUnique:async({where})=>{assert.equal(where.email,'a@example.com');return account}}});assert.ok(r.token);assert.equal(r.user.passwordHash,undefined);
});
test('profile lookup returns public fields and rejects missing users',async()=>{
 const db={user:{findUnique:async()=>account}};assert.equal((await getUserById('u1',db)).passwordHash,undefined);db.user.findUnique=async()=>null;await assert.rejects(getUserById('missing',db),isCode('NOT_FOUND'));
});
test('profile updates validate fields and hashes new passwords',async()=>{
 let data;const db={user:{update:async(x)=>{data=x.data;return {...account,...data}}}};
 for(const b of [{},{role:'ADMIN'},{name:''},{password:'x'}])await assert.rejects(updateOwnProfile('u1',b,db));
 let r=await updateOwnProfile('u1',{name:' New Name '},db);assert.equal(data.name,'New Name');assert.equal(r.passwordHash,undefined);
 await updateOwnProfile('u1',{password:secret},db);assert.equal(await bcrypt.compare(secret,data.passwordHash),true);
});
test('profile update maps missing-record and propagates database errors',async()=>{
 const db={user:{update:async()=>{throw missing()}}};await assert.rejects(updateOwnProfile('u1',{name:'Test'},db),isCode('NOT_FOUND'));const e=new Error('db failure');db.user.update=async()=>{throw e};await assert.rejects(updateOwnProfile('u1',{name:'Test'},db),x=>x===e);
});
test('project create rejects unknown and invalid names before database use',async()=>{
 const db={project:{create:async()=>{throw new Error('unexpected write')}}};for(const b of [{name:''},{name:'Test',ownerId:'other'}])await assert.rejects(createProject('u1',b,db));
});
test('project create trims name and sets creator as owner and member',async()=>{
 let args;const db={project:{create:async(x)=>{args=x;return {id:'p1'}}}};await createProject('u1',{name:'  Project '},db);assert.equal(args.data.name,'Project');assert.equal(args.data.ownerId,'u1');assert.equal(args.data.members.create.userId,'u1');assert.equal(args.data.members.create.projectRole,'Owner');
});
test('project create handles duplicate and other database errors',async()=>{
 const db={project:{create:async()=>{throw unique()}}};await assert.rejects(createProject('u1',{name:'Project'},db),isCode('PROJECT_NAME_IN_USE'));const e=new Error('db failure');db.project.create=async()=>{throw e};await assert.rejects(createProject('u1',{name:'Project'},db),x=>x===e);
});
test('project listing filters by membership',async()=>{
 const db={project:{findMany:async(args)=>{assert.equal(args.where.members.some.userId,'u1');assert.equal(args.orderBy.name,'asc');return []}}};assert.deepEqual(await getProjectsForMember('u1',db),[]);
});
