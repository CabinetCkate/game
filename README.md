# Gamified Learning System

«Лига знаний» — учебное 3D-шоу с пятью видами раундов и сохранением прогресса в SQL Server. После запуска откройте [http://localhost:8080/#show](http://localhost:8080/#show). Демонстрационный вход: `student@example.com` / `Student123!`; выберите курс «Информатика: от алгоритма к данным». Порядок обновления базы, запуск, правила XP, проверенные результаты и ограничения описаны в [docs/show.md](docs/show.md).

The application now uses Microsoft SQL Server. Create its schema in SSMS first:

1. Connect to `WIN-TSO2EOO2KPR\SQLEXPRESS` using Windows Authentication.
2. Open and execute `database/sqlserver/01_CreateGamifiedLearningSystem.sql`, then the additive `database/sqlserver/03_ShowSessions.sql`, `database/sqlserver/04_CourseLessonsAndTeachers.sql`, and `database/sqlserver/05_CourseMarketAndCurrency.sql` updates in order.
3. If the app runs from Docker, enable SQL Server authentication and TCP/IP, set a fixed TCP port, then execute `02_CreateApplicationLogin.sql` after replacing its password placeholder.
4. Put the same login, password, host, and port into `DATABASE_URL` in `.env`. Docker Desktop normally uses `host.docker.internal`; a locally run data service normally uses `localhost`.
5. Run `npm run seed` in `PrismaService` to load demo courses and accounts, then run `docker compose up --build`. The seed includes the teacher demo account `teacher@example.com` / `Teacher123!`; the sign-in page has a **Fill teacher login** button.

`DATABASE_URL` example:

```text
sqlserver://host.docker.internal:1433;database=GamifiedLearningSystem;user=gls_app;password=YOUR_PASSWORD;encrypt=true;trustServerCertificate=true
```

The database schema is deliberately SSMS-owned; the container neither applies Prisma migrations nor seeds production data automatically.

## Visual Studio 2022

Open `Open-in-Visual-Studio.cmd` or `GamifiedLearningSystem.sln`. Set **GamifiedLearningSystem.API** as the startup project, choose **Game (Visual Studio)**, then press **F5**. This profile starts the data service and website automatically, reuses healthy running instances, and opens `http://localhost:8080`. Setup and troubleshooting: [Visual Studio guide](docs/visual-studio.md).

## Languages and answers

The interface supports Қазақша, Русский and English. Choose the language on the sign-in screen or in the top bar; the choice is saved on this device. Russian is the initial language. Form validation and API errors use the chosen language. The original bundled curriculum is translated too: course titles, all 75 questions, prose answer choices, hints and explanations. The new 36-task show course and host lines are in Russian. Custom authored text without a translation remains as authored. Code, answer values, player names and room codes retain their original values. Changing language preserves entered form data, selected answers and the active multiplayer connection.

Sign-in, registration and password reset have separate show/hide buttons for each password field. New passwords require **8–128 characters**, uppercase and lowercase Latin letters, a number and a symbol. A correct submitted choice turns green. An incorrect submitted choice turns red, and the correct choice and explanation are not revealed.

Admin accounts have a dedicated sidebar for students, courses, levels, topics, tasks, achievements, seasons, daily goals, reports and AI settings. Each link opens and highlights its own administration section; device preferences remain available under Settings.

## Teacher Studio and lesson flow

Select **Teacher** during registration to open the Teacher Studio. Teachers can create courses with cover images, written lessons, YouTube links, and multiple-choice tests. Students must read or watch every lesson and mark it complete before a course test unlocks. The AI tutor appears in the student workspace; configure `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` in `.env` to enable generated tutor responses.

## Online 3D studio

Open **???? ?????? ? 3D-???** and choose **Online studio**. Multiplayer is part of the 3D game; old `#multiplayer` invitations redirect into the studio. The theme toggle is next to the language selector on the app and studio top bars, and its choice is saved on this device.

The host can create a room from an existing course, or enter a game title and learning text (80?20,000 characters) and generate 1?20 questions from that material. Source generation uses the server's configured AI provider: set `AI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` in `.env`, then restart the API. The AI selects a numbered source sentence for each answer; the server supplies the original quote and verifies the answer against it, tolerating case and whitespace differences. It rejects unsupported answers and duplicate choices. Valid questions survive retries, and only missing questions are regenerated from unused source facts, with at most three requests within a 90-second deadline. Provider prompt data preserves readable Unicode letters. If AI is unavailable, the form explains how to configure it and course rooms remain available. Provider keys never reach browsers. Generated quizzes are match content and do not create published curriculum or award learning XP.

Share the six-character code or the studio invitation link. Between **2 and 8 connected players** can play with their selected 3D characters. Only the host starts the match. Every question appears on the studio television for three seconds, then the camera returns for two seconds. The server opens answers after this presentation and gives everyone the full configured 10–120 second answer time. Correct answers earn 1,000 match points plus up to 500 for speed. Online players can change their choice until the shared deadline, even after everyone has selected. Only the last choice earns points; correctness and scores stay private until the deadline. The next question begins after six seconds or when the host advances it. Mode switches remain hidden through the final results and return after **Exit**.

The final scene dims the studio and reveals the top four real participants with sequential spotlights and illuminated rank numbers. Rooms with fewer than four players show only actual participants. The full ranking stays available for all players. Reduced motion preserves the reading period and uses instant camera changes. Solo play against bots remains available in the same studio.

Reloading or reconnecting restores the room, character, score, and submitted answer. Disconnected players have 90 seconds to return; an online player inherits host controls when the host disconnects. Rooms are held in the API process memory: server restarts clear them, and finished rooms expire after 15 minutes. Run **one API instance**; multiple instances require shared room storage and a SignalR backplane.

SignalR uses `/api/hubs/game`; WebSocket proxying is included in Vite and frontend Nginx. Players on other devices need to reach the same server; see LAN and internet setup below.

## Running and publishing

### Your own studio topics

In **Solo with bots**, use **Create** under **My topics**. Enter a title, choose
lecture material or a ready test, then paste text or upload PDF, DOCX, TXT, MD,
JSON or CSV (up to 5 MB; PDFs up to 150 pages). Extracted text remains editable.
Scanned PDFs need OCR before upload. AI generation accepts 80–20,000 characters;
ready tests accept up to 100 questions and do not use AI to rewrite answer keys.

Use numbered questions, `A)`, `B)` options and `Answer: B` for a ready text test,
or JSON such as `[{"question":"Two plus two?","options":["3","4"],"correctAnswer":"4"}]`.
A separate final answer key is also accepted: `Жауаптар кілті` / `Ключ ответов` / `Answer key`, followed by `1 — B    2 — C` on one or several lines. Worksheet titles, name/class fields and instructions before the first numbered question are skipped. Every question still needs one unambiguous correct answer; missing, duplicate, conflicting or unknown key entries are rejected.
**Create and save** saves the source and all questions to your account and shows
the exact answer-key preview. Select a saved topic and **Play with bots** to play
with three server-controlled opponents. Practice starts directly, without a room code or a second lobby. Select or change an option, then press **Submit answer** to resolve the bots and see the result immediately. Curriculum multiple-choice practice uses the same select-then-confirm interaction. Online rooms also accept files, ready
tests and saved topics. Online text generation automatically saves its questions.
Generated topics are saved in the selected language. Reusing a topic in its original language does not call AI again; choosing a different language translates the display text while preserving question/option IDs and the correct option. Older topics with mismatched language metadata are detected from their actual question text. Custom topic games award match points
(1,000 for a correct answer plus up to 500 for speed), separate from curriculum XP.

Topic files are private to each student and persist under the API's
`App_Data/quiz-library` directory. `QuizLibrary__Directory` can override this path;
Docker Compose mounts the persistent `quiz_library` volume. Back up this directory
along with the SQL database. Room scores remain in the running API process.

For local development, install dependencies with `npm ci` in both `PrismaService` and `Frontend`, configure SQL Server as above, and use three PowerShell terminals from the repository root:

On Windows, double-click `Start-Game.cmd` to start the services in the background and open the sign-in page after they are ready. The launcher reuses healthy services, checks the database and API connection, and saves startup logs in `artifacts/local-*.log`. You can also run `powershell -ExecutionPolicy Bypass -File C:\Users\user\Desktop\game\scripts\Start-Local.ps1` from any folder; add `-NoBrowser` to check/start the services without opening a browser. For manual startup, use the three terminals below and keep them open.

```powershell
# Terminal 1
. ./scripts/Import-Environment.ps1
Set-Location PrismaService
npm run dev

# Terminal 2
. ./scripts/Import-Environment.ps1
dotnet run --project Backend/GamifiedLearningSystem.API

# Terminal 3
Set-Location Frontend
npm run dev
```

Open `http://localhost:8080`. Multiplayer works across browser sessions that reach the same server.

Local API launches (including the IDE launch profile), the data service and the seed command read the shared repository `.env` automatically. Explicit process environment variables take precedence. The launch profile does not supply separate development secrets: `DATA_SERVICE_KEY` must match between the API and data service. API `/health` checks both the database connection and private service authentication.

The API and frontend proxy both use `API_PORT` from the process environment or shared `.env` (default `5080`). For example, set `API_PORT=5081` to move both to port 5081, then restart the API and frontend. IDE launches follow this port too. Use `API_PROXY_TARGET` only to override the frontend proxy for a different host or an explicit API binding; remove an old override when returning to `API_PORT`. Explicit `--urls` or `ASPNETCORE_URLS` settings override the API binding. If sign-in reports that the server cannot be reached, keep all three services running; the frontend alone cannot authenticate accounts. `Start-Game.cmd` starts the complete local stack.

For devices on the same Wi-Fi using Docker, set `FRONTEND_BIND=0.0.0.0`, `PUBLIC_URL=http://YOUR_LAN_IP:8080` and add your LAN IP to `PUBLIC_HOSTS` in `.env`. Rebuild with `docker compose up --build -d`, allow inbound TCP 8080 in the host firewall, and open that URL on each device. Use a SQL Server address reachable by the Docker containers.

For internet play, deploy this stack to a reachable server with SQL Server access and put an HTTPS reverse proxy in front of frontend port 8080. Set `PUBLIC_URL=https://YOUR_DOMAIN` and `PUBLIC_HOSTS=YOUR_DOMAIN;localhost;127.0.0.1;aspnet-api`. The proxy must forward WebSocket upgrades to the frontend. Keep the data service private. For a reverse proxy running on the same machine, keep `FRONTEND_BIND=127.0.0.1`. A separate proxy container should connect to the frontend container over the Docker network instead. No public server or domain is provisioned by this repository.

## Verification

```powershell
dotnet build GamifiedLearningSystem.sln
dotnet run --project Tests/GamifiedLearningSystem.Tests
Set-Location PrismaService
npm run build
Set-Location ../Frontend
npm run build
npm run test:integration
```

The integration suite starts an isolated API on 5180, UI on 8180 and a deterministic private data-service fixture on 4400. It tests the real C# authentication, validation, quiz engine and SignalR hub, including two browser sessions, reconnection, languages and mobile layouts. It does **not** use your `.env`, SQL Server or production data. SQL persistence remains covered separately by the existing opt-in live suite (`RUN_LIVE_E2E=1`). On a CI machine, install Playwright Chromium before running the suite.
