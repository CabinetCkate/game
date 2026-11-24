import '../src/environment';
import {PrismaClient} from '@prisma/client';
import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {seedShowBank} from './show-bank';
import {seedPreparedSubjects} from './show-subjects';
const prisma=new PrismaClient();
// ASP.NET Core Identity V3: marker, PRF (SHA512), iterations, salt length, salt, subkey.
function passwordHash(password:string){const salt=randomBytes(16),header=Buffer.alloc(13);header[0]=1;header.writeUInt32BE(2,1);header.writeUInt32BE(100000,5);header.writeUInt32BE(16,9);return Buffer.concat([header,salt,pbkdf2Sync(password,salt,100000,32,'sha512')]).toString('base64');}
type Question=[string,string[],string,string,string];
const banks:Record<string,{topics:string[],questions:Question[][]}>={
 'csharp':{topics:['Variables','Conditions','Loops','Arrays','OOP'],questions:[
 [
 ['Which C# type stores whole numbers?',['int','string','bool','double'],'int','An int stores a signed 32-bit integer.','Think of a number without a fractional part.'],
 ['What is the value of 7 / 2 when both operands are integers?',['3','3.5','4','2'],'3','Integer division truncates toward zero.','Check the types of both operands.'],
 ['A bool can store true or false.',['True','False'],'True','The bool type represents two logical values.','Consider the two possible logical states.'],
 ['Which declaration creates a string?',['string name = "Ada";','int name = "Ada";','bool name = "Ada";','string name = 3;'],'string name = "Ada";','Text enclosed in double quotes is a string literal.','Match the literal to its type.'],
 ['What does var do in a local declaration?',['Infers the type at compile time','Makes the variable dynamic','Disables type checking','Creates a global variable'],'Infers the type at compile time','var uses the initializer to infer a static type.','The compiler still knows the type.']
 ],[
 ['Which operator checks equality?',['==','=','!=','=>'],'==','== compares values; = assigns a value.','Comparison and assignment use different symbols.'],
 ['What is 5 > 3 && 2 > 4?',['False','True'],'False','AND requires both conditions to be true.','Evaluate each side separately.'],
 ['Which keyword provides an alternative branch?',['else','using','return','class'],'else','else executes when the if condition is false.','Think about the false branch of an if.'],
 ['What does !true evaluate to?',['False','True'],'False','! negates a Boolean value.','Negation reverses the logical state.'],
 ['Which expression is true for x = 10?',['x >= 10','x < 10','x != 10','x == 9'],'x >= 10','Greater-than-or-equal includes equality.','Look for a comparison that includes the boundary.']
 ],[
 ['How many iterations: for(int i=0; i<3; i++)?',['3','2','4','0'],'3','The loop runs for i = 0, 1, 2.','List the values below the upper bound.'],
 ['Which keyword exits a loop immediately?',['break','continue','using','new'],'break','break exits the closest loop or switch.','Skipping one iteration is different from leaving the loop.'],
 ['A do-while loop always executes its body at least once.',['True','False'],'True','The condition is evaluated after the first body execution.','Where is the condition checked?'],
 ['What is sum after: int sum=0; for(int i=1;i<=3;i++) sum+=i;',['6','3','5','4'],'6','The sum is 1 + 2 + 3.','Add each value included by <=.'],
 ['Which loop visits each item in a collection?',['foreach','if','switch','try'],'foreach','foreach enumerates elements in a collection.','The answer is designed for enumeration.']
 ],[
 ['What is the first index in a C# array?',['0','1','-1','2'],'0','C# arrays are zero-indexed.','The first element starts before index one.'],
 ['Which property gives an array element count?',['Length','Count() only','Size','Capacity'],'Length','An array exposes the Length property.','Think of the built-in array property.'],
 ['What is new int[3][0] intended to describe?',['Invalid C# syntax','A valid first element','A jagged array literal','An array length'],'Invalid C# syntax','Use (new int[3])[0] to access a newly created array.','Array creation and access need correct grouping.'],
 ['An array length can change after the array is created.',['False','True'],'False','Array length is fixed; a new array is needed to resize.','Distinguish arrays from List<T>.'],
 ['What is a[1] for int[] a = {2, 4, 6};?',['4','2','6','1'],'4','Index 1 refers to the second element.','Start indexing at zero.']
 ],[
 ['Which keyword creates an instance?',['new','class','static','namespace'],'new','new invokes a constructor to create an object.','A class declaration is different from an object.'],
 ['What does encapsulation primarily protect?',['Internal state behind an interface','Only loop variables','Database indexes','File extensions'],'Internal state behind an interface','Encapsulation controls how internal state is accessed.','Think about public methods and private fields.'],
 ['A C# class can directly inherit from multiple classes.',['False','True'],'False','A class has one direct base class, but can implement multiple interfaces.','Classes and interfaces have different inheritance rules.'],
 ['Which modifier allows access only inside the containing class?',['private','public','internal','protected'],'private','private members are accessible within their containing type.','Choose the narrowest access modifier.'],
 ['Which feature allows a derived class to replace virtual behavior?',['override','const','sealed only','readonly'],'override','override supplies an implementation for an inherited virtual member.','Look for the keyword paired with virtual.']
 ]]},
 'sql':{topics:['SELECT','Filtering','Aggregation','Joins','Transactions'],questions:[
 [
 ['Which statement retrieves rows?',['SELECT','INSERT','DELETE','DROP'],'SELECT','SELECT reads rows from tables.','Choose a reading operation.'],
 ['What does SELECT * mean?',['Select every column','Delete all rows','Select no columns','Create a table'],'Select every column','The wildcard expands to all columns.','The wildcard refers to columns.'],
 ['Which clause chooses the source table?',['FROM','WHERE','ORDER BY','LIMIT'],'FROM','FROM identifies the source relation.','Think about where the rows come from.'],
 ['SELECT can read data without modifying it.',['True','False'],'True','A normal SELECT query reads data.','Reading and updating use different statements.'],
 ['Which keyword removes duplicate result rows?',['DISTINCT','UNIQUE only','GROUP','REMOVE'],'DISTINCT','SELECT DISTINCT deduplicates the selected values.','It follows SELECT.']
 ],[
 ['Which clause filters individual rows?',['WHERE','ORDER BY','FROM','LIMIT'],'WHERE','WHERE applies a predicate before grouping.','Think of a row condition.'],
 ['How do you check for a NULL value?',['IS NULL','= NULL','== NULL','LIKE NULL'],'IS NULL','NULL uses IS NULL because equality comparisons return unknown.','NULL is not an ordinary value.'],
 ['BETWEEN 2 AND 5 includes both endpoints in MySQL.',['True','False'],'True','BETWEEN is inclusive at both ends.','Consider the boundary values.'],
 ['Which operator matches a text pattern?',['LIKE','INTO','JOIN','HAVING'],'LIKE','LIKE supports % and _ pattern wildcards.','The pattern may contain %.'],
 ['Which clause sorts query results?',['ORDER BY','WHERE','SET','VALUES'],'ORDER BY','ORDER BY specifies sort expressions and direction.','Filtering does not define order.']
 ],[
 ['Which function counts rows?',['COUNT(*)','SUM(*)','ROWS()','TOTAL()'],'COUNT(*)','COUNT(*) counts all rows in a group.','Choose a counting aggregate.'],
 ['Which clause groups rows?',['GROUP BY','ORDER BY','WHERE','FROM'],'GROUP BY','GROUP BY forms sets for aggregation.','Grouping and sorting differ.'],
 ['Which clause filters aggregated groups?',['HAVING','WHERE','LIMIT','SELECT'],'HAVING','HAVING filters groups after aggregation.','The aggregate already exists at this stage.'],
 ['COUNT(column) ignores NULL values.',['True','False'],'True','COUNT(expression) counts non-NULL values.','Compare COUNT(*) with COUNT(column).'],
 ['Which function computes the arithmetic mean?',['AVG','SUM','MAX','COUNT'],'AVG','AVG divides the sum of non-NULL values by their count.','The mean is an average.']
 ],[
 ['An INNER JOIN returns which rows?',['Rows matching both tables','All left rows','All right rows','Only unmatched rows'],'Rows matching both tables','INNER JOIN retains pairs matching the join predicate.','Think of the intersection.'],
 ['Which join keeps unmatched left rows?',['LEFT JOIN','INNER JOIN','CROSS JOIN','RIGHT JOIN'],'LEFT JOIN','LEFT JOIN keeps all left rows and fills missing right values with NULL.','Preserve the left side.'],
 ['A CROSS JOIN produces a Cartesian product.',['True','False'],'True','Every left row is paired with every right row.','All possible row pairs are included.'],
 ['Which clause specifies a join condition?',['ON','SET','VALUES','LIMIT'],'ON','ON defines how rows are matched.','It follows a JOIN table reference.'],
 ['Why qualify columns with table aliases?',['Avoid ambiguity','Encrypt data','Create an index','Commit a transaction'],'Avoid ambiguity','Aliases distinguish identically named columns in different tables.','Two tables may both have an id.']
 ],[
 ['Which command makes a transaction permanent?',['COMMIT','ROLLBACK','SELECT','DESCRIBE'],'COMMIT','COMMIT persists the transaction changes.','Choose the successful end of a transaction.'],
 ['Which command cancels an uncommitted transaction?',['ROLLBACK','COMMIT','GRANT','SHOW'],'ROLLBACK','ROLLBACK restores the previous transactional state.','Think of undoing pending changes.'],
 ['Parameterized queries help prevent SQL injection.',['True','False'],'True','Bound parameters keep data separate from SQL syntax.','User input should not become SQL code.'],
 ['What does atomicity guarantee?',['All operations commit or none do','Queries run alphabetically','Every table has one row','No indexes are needed'],'All operations commit or none do','Atomicity treats the transaction as a single unit.','A partial update must not survive.'],
 ['Which constraint prevents duplicate column values?',['UNIQUE','DEFAULT','CHECK only','NULL'],'UNIQUE','A UNIQUE constraint rejects duplicate key values.','Think of a unique email address.']
 ]]},
 'web':{topics:['HTML','CSS','JavaScript','DOM','Async'],questions:[
 [
 ['Which element represents the main heading?',['h1','p','span','footer'],'h1','h1 is the highest heading level.','Choose the first heading level.'],
 ['Which attribute describes an image for assistive technology?',['alt','src','href','class'],'alt','alt supplies a text alternative for an image.','The URL alone does not describe content.'],
 ['A button is a semantic element for an action.',['True','False'],'True','button supplies keyboard and accessibility behavior.','Actions and navigation have different elements.'],
 ['Which element creates a hyperlink?',['a','div','section','input'],'a','The anchor element uses href for navigation.','It supports opening in a new tab.'],
 ['Which input type validates email format?',['email','text only','number','button'],'email','type=email adds browser email format validation.','Use an appropriate semantic input type.']
 ],[
 ['Which property changes text color?',['color','background','display','padding'],'color','color sets the foreground text color.','Text and background have separate properties.'],
 ['Which layout supports two-dimensional rows and columns?',['grid','inline','float only','block only'],'grid','CSS Grid defines rows and columns.','Flexbox is primarily one-dimensional.'],
 ['padding adds space inside an element border.',['True','False'],'True','Padding is internal spacing; margin is external.','Look inside the border.'],
 ['Which selector targets a class named card?',['.card','#card','card','@card'],'.card','A dot denotes a class selector.','IDs use a different prefix.'],
 ['Which media query honors reduced motion?',['prefers-reduced-motion','prefers-color-scheme','min-width only','hover only'],'prefers-reduced-motion','The preference lets interfaces reduce movement.','Think of a user accessibility preference.']
 ],[
 ['Which keyword declares a block-scoped mutable variable?',['let','const only','global','define'],'let','let is block scoped and can be reassigned.','const cannot be reassigned.'],
 ['What is 2 + 3 in JavaScript?',['5','23','6','NaN'],'5','Both operands are numbers, so addition is numeric.','Neither operand is a string.'],
 ['Strict equality === avoids type coercion.',['True','False'],'True','=== compares without converting operand types.','Compare it to ==.'],
 ['Which method transforms each array element?',['map','find','some','includes'],'map','map creates an array containing transformed values.','You want one output per input.'],
 ['What is typeof true?',['boolean','bool','number','object'],'boolean','The typeof result for a Boolean is boolean.','JavaScript spells out this type name.']
 ],[
 ['Which method selects the first matching DOM element?',['querySelector','querySelectorAll','getAll','selectMany'],'querySelector','querySelector returns the first match or null.','There is a plural version for all matches.'],
 ['Which API adds an event handler?',['addEventListener','setEvent','bindDOM','onAll'],'addEventListener','addEventListener registers a listener for an event type.','Listeners respond to events.'],
 ['textContent can insert text without interpreting it as HTML.',['True','False'],'True','textContent treats its value as plain text.','This is safer for untrusted text.'],
 ['Which event fires when a form is submitted?',['submit','hover','load only','keydown only'],'submit','The submit event belongs to the form.','The form has its own submission event.'],
 ['What does event.preventDefault() do?',['Cancels the default browser action','Deletes the element','Stops all JavaScript','Reloads the page'],'Cancels the default browser action','It cancels the default action for a cancelable event.','Propagation is a separate concept.']
 ],[
 ['What does an async function return?',['A Promise','Always a string','A DOM node','Nothing'],'A Promise','async functions wrap their return values in promises.','The result may resolve later.'],
 ['Which keyword waits for a promise in an async function?',['await','yield only','wait','pause'],'await','await resumes execution after promise settlement.','It is paired with async.'],
 ['fetch rejects its promise automatically for every HTTP 404.',['False','True'],'False','fetch resolves HTTP error responses; check response.ok.','Network failures differ from HTTP errors.'],
 ['Which utility waits for all promises to fulfill?',['Promise.all','Promise.race','setTimeout','JSON.parse'],'Promise.all','Promise.all resolves with all results or rejects when one rejects.','All results are needed.'],
 ['Which block handles an awaited rejection?',['catch','finally only','switch','for'],'catch','try/catch handles exceptions including awaited promise rejections.','finally runs regardless of success.']
 ]]}
};
const courseLessons:Record<string,string[]>={
 csharp:[
  'A variable stores a value under a name. C# uses types such as int for whole numbers, double for decimal values, bool for true/false, and string for text. Declare a variable before using it. var asks the compiler to infer a static type from the initializer.',
  'A condition chooses which statements run. if runs a block when a Boolean condition is true; else handles the other path. Use == to compare values and = to assign them. Combine conditions with && (both true) or || (at least one true).',
  'A loop repeats work. for is useful when you know how a counter starts, changes, and stops. while repeats while a condition remains true. foreach visits each item in a collection. Make sure the loop condition will eventually become false.',
  'An array stores a fixed number of values of one type. C# indexes start at zero, so the first item is at index 0 and the last is at Length - 1. Read or update an item with square brackets, for example scores[0].',
  'A class describes the data and behavior of a kind of object. An object is an instance of that class. Encapsulation keeps internal state behind methods or properties. Access modifiers control who can use members; inheritance and interfaces let types share or promise behavior.'
 ],
 sql:[
  'A relational database stores records in tables. SELECT chooses columns, FROM names the source table, and ORDER BY sorts the result. Use DISTINCT after SELECT when duplicate result rows should appear only once.',
  'WHERE filters individual rows before groups are formed. Use comparisons and AND/OR to narrow results. Check missing values with IS NULL because NULL is not compared like an ordinary value. LIKE matches text patterns such as name starting with A%.',
  'Aggregate functions summarize rows: COUNT counts, SUM adds, and AVG calculates a mean. GROUP BY creates one result per group; HAVING filters those groups after aggregation. WHERE is for rows, while HAVING is for grouped results.',
  'A JOIN combines rows from related tables. INNER JOIN keeps matching pairs; LEFT JOIN keeps every row from the left table. ON states how records match, often using a primary key and a foreign key. Table aliases make repeated column names clear.',
  'A transaction groups related changes into one unit. COMMIT saves them; ROLLBACK cancels uncommitted changes. Use parameterized queries to keep user input separate from SQL syntax, and add constraints such as PRIMARY KEY and NOT NULL to protect data.'
 ],
 web:[
  'HTML describes page structure and meaning. Use headings in order, paragraphs for text, buttons for actions, and links for navigation. Add useful alt text to meaningful images so people using assistive technology can understand them.',
  'CSS controls presentation. Select a class with a dot, such as .card. Use Grid for rows and columns, and Flexbox for a line of items. Padding is space inside a border; margin is space outside it. Add a prefers-reduced-motion rule for users who ask for less movement.',
  'JavaScript adds behavior. Use const for bindings you will not reassign and let when a binding must change. Arrays store ordered values; map creates a transformed array. Strict equality (===) compares values without implicit type conversion.',
  'The DOM is the browser’s object representation of a page. querySelector finds the first matching element. addEventListener attaches a handler for events such as click or submit. Use textContent for plain text; it does not interpret a string as HTML.',
  'Asynchronous work may finish later. fetch returns a Promise, and await pauses an async function until that Promise settles. Check response.ok because an HTTP 404 still resolves fetch. Use try/catch for failures and show the user what to do next.'
 ]
};
async function seed(){
 for(const [i,name] of ['Student','Amina','Daniyar','Alex','Sara'].entries()){
  const email=i===0?'student@example.com':name.toLowerCase()+'@example.com';
  const demoPasswordHash=passwordHash('Student123!');
  await prisma.user.upsert({where:{email},update:i===0?{passwordHash:demoPasswordHash}:{},create:{id:`user-${i}`,email,passwordHash:demoPasswordHash,student:{create:{id:`student-${i}`,firstName:name,lastName:i===0?'Learner':'Academy',bio:'Learning one challenge at a time.'}}}});
 }
 await prisma.user.upsert({where:{email:'admin@example.com'},update:{},create:{id:'admin',email:'admin@example.com',passwordHash:passwordHash('Admin123!'),role:'ADMIN'}});
 const teacherPasswordHash=passwordHash('Teacher123!');
 const teacherUser=await prisma.user.upsert({where:{email:'teacher@example.com'},update:{passwordHash:teacherPasswordHash,role:'TEACHER'},create:{id:'teacher-demo',email:'teacher@example.com',passwordHash:teacherPasswordHash,role:'TEACHER'}});
 await prisma.teacher.upsert({where:{userId:teacherUser.id},update:{firstName:'Demo',lastName:'Teacher'},create:{id:'teacher-demo-profile',userId:teacherUser.id,firstName:'Demo',lastName:'Teacher'}});
 for(const [key,bank] of Object.entries(banks)){
  const title=key==='csharp'?'C# Foundations':key==='sql'?'SQL & Databases':'Web Development';
  await prisma.course.upsert({where:{id:key},update:{},create:{id:key,title,description:key==='csharp'?'Build a strong foundation in C#, from your first variable to object-oriented thinking.':key==='sql'?'Turn data into answers. Learn queries, joins, and reliable transactions.':'Create accessible web experiences with HTML, CSS, and modern JavaScript.',category:key==='sql'?'Data':'Development',estimatedMinutes:120,isPublished:true}});
  for(let i=0;i<bank.topics.length;i++){const materialId=`${key}-lesson-${i+1}`;await prisma.courseMaterial.upsert({where:{id:materialId},update:{title:bank.topics[i],content:courseLessons[key][i]},create:{id:materialId,courseId:key,title:bank.topics[i],content:courseLessons[key][i],order:i+1}});}
  for(let l=0;l<5;l++){
   const levelId=`${key}-level-${l+1}`,topicId=`${key}-topic-${l+1}`;
   await prisma.level.upsert({where:{id:levelId},update:{},create:{id:levelId,courseId:key,title:['Beginner','Explorer','Intermediate','Advanced','Expert'][l],description:bank.topics[l],order:l+1,requiredXP:[0,500,1200,2500,5000][l]}});
   await prisma.topic.upsert({where:{id:topicId},update:{},create:{id:topicId,courseId:key,name:bank.topics[l],description:`Practice ${bank.topics[l]}.`}});
   for(let t=0;t<5;t++){
    const [question,options,correctAnswer,explanation,hint]=bank.questions[l][t];const id=`${key}-task-${l+1}-${t+1}`;
    await prisma.task.upsert({where:{id},update:{},create:{id,levelId,topicId,title:`${bank.topics[l]} · Challenge ${t+1}`,description:'Choose the best answer.',question,correctAnswer,explanation,hint,order:t+1,taskType:options.length===2?'TRUE_FALSE':'MULTIPLE_CHOICE',difficulty:t<2?'EASY':t<4?'MEDIUM':'HARD',xpReward:100,timeLimit:120,options:{create:options.map((text,order)=>({id:`${id}-option-${order}`,text,order}))}}});
   }
  }
 }
 const achievements=[['first-step','First Step','Complete your first challenge.','target','TASKS',1],['three-day','3 Day Streak','Learn three days in a row.','flame','STREAK',3],['seven-day','7 Day Streak','Learn seven days in a row.','flame','STREAK',7],['speed','Speed Learner','Solve a challenge in half the time.','zap','SPEED',1],['perfect','Perfect Score','Answer 10 challenges correctly in a row.','trophy','PERFECT',10],['course-master','Course Master','Complete an entire course.','graduation-cap','COURSE',1],['xp-hunter','XP Hunter','Earn 5,000 XP.','gem','XP',5000],['champion','Champion','Reach the top of the global league.','crown','CHAMPION',1],['daily','Daily Dedication','Complete a daily goal.','calendar-check','GOAL',1],['ten-tasks','Explorer','Complete 10 different challenges.','compass','TASKS',10]] as const;
 for(const [code,title,description,icon,condition,target] of achievements)await prisma.achievement.upsert({where:{code},update:{},create:{id:code,code,title,description,icon,condition,target,xpReward:300}});
 await prisma.dailyGoal.upsert({where:{id:'daily-three'},update:{},create:{id:'daily-three',title:'Complete 3 challenges today',target:3,xpReward:200}});
 const year=new Date().getUTCFullYear();
 await prisma.season.upsert({where:{id:'season-01'},update:{},create:{id:'season-01',title:'Cyber Academy',description:'A new season. A fresh chance to climb.',startsAt:new Date(`${year}-10-01T00:00:00Z`),endsAt:new Date(`${year}-12-31T23:59:59Z`),rewards:JSON.stringify([{rank:1,badge:'GOLD',title:'Academy Champion'},{rank:2,badge:'SILVER',title:'Silver Scholar'},{rank:3,badge:'BRONZE',title:'Bronze Explorer'}])}});
 const board=await prisma.leaderboard.upsert({where:{period:'global'},update:{},create:{id:'global',name:'Global League',period:'global'}});
 for(let i=0;i<5;i++)await prisma.leaderboardEntry.upsert({where:{leaderboardId_studentId:{leaderboardId:board.id,studentId:`student-${i}`}},update:{},create:{leaderboardId:board.id,studentId:`student-${i}`,xp:0}});
 await seedShowBank(prisma);
 await seedPreparedSubjects(prisma);
 console.log('Seed complete: 1 admin, 1 teacher demo, 5 students, 9 courses, 21 levels, 161 questions (86 prepared show tasks), 10 achievements.');
}
seed().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
