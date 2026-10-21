import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixtureServer} from '../Frontend/tests/fixtures/data-service.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
process.env.QuizLibrary__Directory=fileURLToPath(new URL('../artifacts/integration-quiz-library/'+Date.now()+'/',import.meta.url));
const key='integration-test-private-service-key-123456789';
const server=fixtureServer(key);await new Promise(resolve=>server.listen(4400,'127.0.0.1',resolve));
const children=[];
function start(command,args,extra={}){const child=spawn(command,args,{cwd:root,env:{...process.env,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);child.stdout.on('data',data=>{if(command===process.execPath)process.stdout.write(data);});child.stderr.on('data',data=>process.stderr.write(data));child.on('exit',code=>{if(code)process.stderr.write(`${command} exited with ${code}\n`);});return child;}
const apiArgs=process.env.TEST_API_DLL?[process.env.TEST_API_DLL,'--contentRoot',fileURLToPath(new URL('../Backend/GamifiedLearningSystem.API/',import.meta.url)),'--urls','http://localhost:5180']:['run','--project','Backend/GamifiedLearningSystem.API','--no-build','--no-launch-profile','--urls','http://localhost:5180'];
start('dotnet',apiArgs,{JWT_SECRET:'integration-test-jwt-secret-distinct-123456789',DATA_SERVICE_KEY:key,DataService__Url:'http://127.0.0.1:4400/',AI_API_KEY:'fixture-ai-key',AI_MODEL:'fixture-model',AI_BASE_URL:'http://127.0.0.1:4400/v1',AllowedHosts:'localhost;127.0.0.1'});
let ready=false;for(let attempt=0;attempt<120;attempt++){try{ready=(await fetch('http://localhost:5180/health')).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,250));}
if(!ready)throw Error('The integration API did not start. Build the solution first.');
start(process.execPath,['Frontend/node_modules/vite/bin/vite.js','Frontend','--host','127.0.0.1','--port','8180','--strictPort'],{API_PROXY_TARGET:'http://localhost:5180'});
function stop(){for(const child of children)child.kill();server.close();setTimeout(()=>process.exit(0),300).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);process.on('exit',()=>{for(const child of children)child.kill();});
