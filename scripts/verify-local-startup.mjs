// Uses the configured local SQL database and demo account; no accounts are created.
// Exercises both F5 profiles with fresh data/website processes on isolated ports.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const api = 'http://localhost:5191';
const website = 'http://localhost:8191';
for (const port of [4191, 5191, 8191]) {
 let occupied = false;
 try { await fetch(`http://localhost:${port}`, {signal:AbortSignal.timeout(1000)}); occupied = true; } catch {}
 assert(!occupied, `Test port ${port} is already in use.`);
}
async function stopTree(child) {
 if (child?.exitCode === null) {
  const stop = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true,stdio:'ignore'});
  await once(stop, 'exit');
  if (child.exitCode === null) await once(child, 'exit');
 }
}
for (const [profile, reuseWebsite] of [['Game (Visual Studio)', false], ['GamifiedLearningSystem.API', false], ['Game (Visual Studio)', true]]) {
 let oldWebsite;
 if (reuseWebsite) {
  oldWebsite = spawn(process.execPath, ['Frontend/node_modules/vite/bin/vite.js', 'Frontend', '--port', '8191', '--strictPort'],
   {cwd:root, windowsHide:true, stdio:'ignore', env:{...process.env,API_PROXY_TARGET:'http://localhost:59999'}});
  try {
   let ready = false;
   for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(website)).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
   }
   assert(ready, 'The stale website fixture must start.');
  } catch (error) { await stopTree(oldWebsite); throw error; }
 }
 let output = '';
 const child = spawn('dotnet', ['run', '--project', 'Backend/GamifiedLearningSystem.API',
  '--no-build', '--launch-profile', profile, '--', '--urls', api,
  '--DataService:Url=http://localhost:4191/', '--LocalDevelopment:FrontendPort=8191',
  '--LocalDevelopment:OpenBrowser=false'], {cwd:root, windowsHide:true, stdio:['ignore','pipe','pipe']});
 child.stdout.on('data', data => output += data);
 child.stderr.on('data', data => output += data);
 try {
  const deadline = Date.now() + 150000;
  while (!output.includes('Game is ready:')) {
   assert(child.exitCode === null, `${profile} exited before becoming ready.\n${output}`);
   assert(Date.now() < deadline, `${profile} startup timed out.\n${output}`);
   await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(output.includes('Prisma data service listening'), 'The profile must start the data service itself.');
  assert.equal((await fetch(`${api}/health`)).status, 200);
  assert.equal((await fetch(`${website}/api/students/me`)).status, 401);
  const login = await fetch(`${website}/api/auth/login`, {method:'POST',
   headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'student@example.com',password:'Student123!'})});
  assert.equal(login.status, 200, `${profile}: demo login failed.`);
  const tokens = await login.json();
  assert(tokens.accessToken, 'Login must return an access token.');
  assert.equal((await fetch(`${website}/api/students/me`, {headers:{Authorization:`Bearer ${tokens.accessToken}`}})).status, 200);
  if (tokens.refreshToken) await fetch(`${website}/api/auth/logout`, {method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:tokens.refreshToken})});
  if (reuseWebsite) assert(output.includes('Using the running Website'), 'The existing website must be reused.');
  console.log(`PASS: ${profile}: ${reuseWebsite ? 'reused website with obsolete API target' : 'cold start'}, SQL readiness, website proxy, login and authenticated profile.`);
 } finally {
  // Only terminate this test's process tree, including its Vite and data service children.
  await stopTree(child);
  await stopTree(oldWebsite);
 }
}
