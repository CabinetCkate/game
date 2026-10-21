import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require = createRequire(import.meta.url);
const {HubConnectionBuilder, LogLevel} = require('../Frontend/node_modules/@microsoft/signalr');
const base = process.env.ROOM_TEST_URL || 'http://localhost:8080';
let connection, room;
const source = process.argv[2] ? await readFile(process.argv[2], 'utf8') : 'Mercury is the closest planet to the Sun. Venus has a thick atmosphere. Earth has one natural satellite. Mars is called the red planet.';
const count = Number(process.argv[3] || 2);
const language = process.argv[4] || null;
try {
 if(language && !['kk','ru','en'].includes(language)) throw Error('invalidLanguage');
 if(!Number.isInteger(count) || count<1 || count>20) throw Error('invalid_room');
 const response = await fetch(base + '/api/auth/login', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'student@example.com',password:'Student123!'})
 });
 if (!response.ok) throw Error('login_http_' + response.status);
 const {accessToken} = await response.json();
 connection = new HubConnectionBuilder().withUrl(base + '/api/hubs/game', {accessTokenFactory:()=>accessToken}).configureLogging(LogLevel.None).build();
 connection.on('RoomUpdated',()=>{});
 await connection.start();
 const settings = [process.argv[2] ? 'SQLite' : 'Solar system', source, count, 20, 'nova'];
 room = language ? await connection.invoke('CreateLocalizedTextRoom', ...settings, language) : await connection.invoke('CreateTextRoom', ...settings);
 if (room.questionCount !== count || room.status !== 'lobby') throw Error('invalid_room');
 if(language && room.language !== language) throw Error('invalid_room_language');
 const verifiedLanguages = language ? [language] : [];
 if(language){
  const code=room.code;
  for(const next of ['kk','en','ru'].filter(value=>value!==language)){
   room=await connection.invoke('SetRoomLanguage',code,next);
   if(room.code!==code || room.language!==next || room.status!=='lobby' || room.questionCount!==count) throw Error('invalid_room_language');
   verifiedLanguages.push(next);
  }
 }
 console.log(JSON.stringify({status:'passed',questionCount:room.questionCount,roomCreated:true,throughWebsite:base==='http://localhost:8080',...(language ? {creationLanguage:language,verifiedLanguages} : {})}));
} catch(error) {
 // Hub errors contain rule names; do not print tokens or provider responses.
 const known = ['aiUnavailable','generationFailed','serverUnavailable','generationBusy','invalidGeneratedQuiz','insufficientSourceFacts','alreadyInRoom','translationFailed','invalidLanguage','invalid_room_language','invalid_room'];
 console.error(JSON.stringify({status:'failed',reason:known.find(code=>error.message.includes(code)) || (error.message.startsWith('login_http_')?error.message:'room_check_failed')}));
 process.exitCode = 1;
} finally {
 if (room && connection) await connection.invoke('LeaveRoom',room.code).catch(()=>{});
 if (connection) await connection.stop().catch(()=>{});
}
