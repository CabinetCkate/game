# Visual Studio 2022 арқылы ашу

1. `Open-in-Visual-Studio.cmd` файлын екі рет басыңыз. Немесе Visual Studio ішінде **File → Open → Project/Solution** арқылы `GamifiedLearningSystem.sln` файлын ашыңыз.
2. Solution Explorer ішінде **GamifiedLearningSystem.API → Set as Startup Project** таңдаңыз.
3. Жасыл іске қосу батырмасының жанындағы тізімнен **Game (Visual Studio)** профилін таңдаңыз.
4. **F5** басыңыз. Деректер қызметі, сайт және API автоматты іске қосылады. База мен сайттың API-ге қосылуы тексерілгеннен кейін браузерде `http://localhost:8080/#login` ашылады. Ноутбук қайта қосылғаннан кейін де `Start-Game.cmd` файлын бөлек іске қосу қажет емес. Бұрыннан қосылған сайт пен деректер қызметі қайта пайдаланылады; SQL Server дайындалып жатса, іске қосу 120 секундқа дейін күтеді.

Демонстрациялық кіру: `student@example.com` / `Student123!`.

Жобаға Visual Studio 2022 **17.12 немесе жаңа нұсқасы**, **ASP.NET and web development** workload, **.NET 9 SDK**, **Node.js** және SQL Server қажет. `.vsconfig` файлы қажетті Visual Studio workload-ын көрсетеді; `global.json` .NET 9 SDK-ін таңдайды. Бұл компьютерде Visual Studio 2022 17.14 және .NET SDK 9.0.306 орнатылған.

`Frontend` пен `PrismaService` бумаларында `node_modules` болмаса, әр бумада `npm ci` орындаңыз. Ортақ `.env` файлы және SQL Server базасы сол күйі пайдаланылады; парольдер solution файлына көшірілмейді. Негізгі жобалар, тесттер, сайт коды, деректер қызметі және SQL файлдары Solution Explorer ішінде көрсетіледі.

**GamifiedLearningSystem.API** профилі де ойынды толық іске қосады: Visual Studio бұрынғы профильді есте сақтаса да, F5 барлық қызметтерді қосады. API порты ортақ `.env` ішіндегі `API_PORT` параметрінен алынады. F5 алдында сол портта бұрын іске қосылған API болса, соны өз терминалында тоқтатыңыз. Visual Studio-дан қалыпты тоқтатқанда профиль өзі бастаған қосымша қызметтерді тоқтатады; бұрыннан жұмыс істеп тұрған қызметтерді қалдырады. Тек API керек болса, `dotnet run --project Backend/GamifiedLearningSystem.API --no-launch-profile` пайдаланыңыз.

Microsoft құжаттамасы: [Visual Studio startup projects](https://learn.microsoft.com/en-us/visualstudio/ide/how-to-set-multiple-startup-projects).

Іске қосу мен кіруді қайта тексеру: алдымен `dotnet build GamifiedLearningSystem.sln`, содан кейін `node scripts/verify-local-startup.mjs`. Тексеру екі F5 профилін де бөлек порттарда нөлден қосып, нақты SQL базасындағы демонстрациялық аккаунтпен кіреді және тек өзі іске қосқан процестерді тоқтатады.

Visual Studio API-ге бөлек HTTP/HTTPS адресін беруі мүмкін (мысалы, `https://localhost:5001`). F5 кезінде API нақты адресін `artifacts/local-api-8080.json` файлына жазады; сайт сол іске қосылған процестің адресін HTTP және WebSocket сұраулары үшін автоматты пайдаланады. Сондықтан бұрын ашылған сайтты порт өзгергенде қолмен қайта қосу қажет емес. Файлда тек процесс нөмірі мен жергілікті адрес бар; тоқтаған процестің адресі ескерілмейді. Жергілікті HTTPS үшін Visual Studio development сертификаты қабылданады.
