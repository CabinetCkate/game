import {existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {config} from 'dotenv';

// Resolve from the service location, including dist/src, rather than the shell's cwd.
// dotenv preserves explicit deployment/test environment variables.
for(let directory=__dirname;;directory=dirname(directory)){
 const path=join(directory,'.env');
 if(existsSync(path)){config({path});break;}
 if(dirname(directory)===directory)break;
}
