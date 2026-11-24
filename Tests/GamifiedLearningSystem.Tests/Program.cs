using GamifiedLearningSystem.Domain;
using GamifiedLearningSystem.Domain.Entities;
using GamifiedLearningSystem.Application.DTOs;
using GamifiedLearningSystem.Application.Validators;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

var engine=new GamificationEngine([0,500,1200,2500,5000,9000,15000,25000]);
var today=new DateOnly(2026,10,5);
GameSnapshot State()=>new(new("student",0,1,0,0,0),new("task","level","topic","int",100,120,"int stores integers"),0,false,0,0,false,false,null,20,false,[],[],[]);
AttemptPlan Evaluate(GameSnapshot s,string answer="int")=>engine.Evaluate(s,answer,"session","request",today);
var count=0;
void Check(bool success,string name){if(!success)throw new Exception("FAIL: "+name);Console.WriteLine("PASS: "+name);count++;}
var environmentDirectory=Path.Combine(Path.GetTempPath(),"gls-environment-"+Guid.NewGuid());
try {
    var nested=Path.Combine(environmentDirectory,"Backend","API");
    Directory.CreateDirectory(nested);
    Check(GamifiedLearningSystem.API.Configuration.LocalEnvironment.Read(nested).Count==0,"Missing local environment leaves deployment configuration untouched");
    File.WriteAllText(Path.Combine(environmentDirectory,".env"),"# local settings\nDATA_SERVICE_KEY=shared-key\nDATABASE_URL=sqlserver://localhost:1433;password=a=b#c\nJWT_SECRET=shared-jwt\n");
    var local=GamifiedLearningSystem.API.Configuration.LocalEnvironment.Read(nested);
    Check(local["DATA_SERVICE_KEY"]=="shared-key"&&local["JWT_SECRET"]=="shared-jwt","An IDE launch finds the shared repository environment");
    Check(local["DATABASE_URL"]=="sqlserver://localhost:1433;password=a=b#c","Environment values preserve password punctuation");
    local["API_PORT"]="5081";
    Check(GamifiedLearningSystem.API.Configuration.LocalEnvironment.ApiUrl(null,null,local)=="http://localhost:5081","IDE API binding follows the shared local port used by the frontend proxy");
    Check(GamifiedLearningSystem.API.Configuration.LocalEnvironment.ApiUrl(null,"5090",local)=="http://localhost:5090","Process API_PORT overrides the local development port");
    Check(GamifiedLearningSystem.API.Configuration.LocalEnvironment.ApiUrl("http://+:8080","5090",local)=="http://+:8080","Explicit deployment URLs override development port settings");
    Check(GamifiedLearningSystem.API.Configuration.LocalEnvironment.ApiUrl(null,null,new Dictionary<string,string>())=="http://localhost:5080","Unconfigured local launches match the default frontend proxy");
    var rejectedPort=false;
    try { GamifiedLearningSystem.API.Configuration.LocalEnvironment.ApiUrl(null,"70000",local); }
    catch(InvalidOperationException) { rejectedPort=true; }
    Check(rejectedPort,"Invalid API ports fail with a clear startup configuration error");
} finally { Directory.Delete(environmentDirectory,true); }
var first=Evaluate(State());
Check(first.IsCorrect&&first.XpEarned==150,"First correct answer earns a server-calculated perfect bonus");
Check(first.CurrentStreak==1,"First completion starts a streak");
Check(Evaluate(State(),"string").XpEarned==0,"Wrong answers cannot award task XP");
Check(Evaluate(State() with{AlreadyCompleted=true,AttemptCount=1}).XpEarned==0,"Repeated completion cannot award task XP twice");
Check(Evaluate(State() with{ElapsedSeconds=121}).IsCorrect==false,"Server time limit rejects late answers");
Check(Evaluate(State() with{HintUsed=true}).XpEarned==100,"Hint usage removes perfect bonus");
Check(Evaluate(State() with{LastDate="2026-10-04",Student=State().Student with{CurrentStreak=2,LongestStreak=2}}).CurrentStreak==3,"Consecutive calendar days extend a streak");
Check(Evaluate(State() with{LastDate="2026-10-02",Student=State().Student with{CurrentStreak=7,LongestStreak=7}}).CurrentStreak==1,"Missed days reset current streak");
Check(Evaluate(State() with{LastDate="2026-10-05",Student=State().Student with{CurrentStreak=3,LongestStreak=3}}).CurrentStreak==3,"Multiple tasks on the same day do not extend streak");
var goal=new GoalState("daily","Complete 3",3,200,2,false);
Check(Evaluate(State() with{Goals=[goal]}).XpEarned==350,"Third distinct completion awards the daily reward atomically");
Check(Evaluate(State() with{Goals=[goal with{Progress=3,Completed=true}]}).XpEarned==150,"Completed daily goals do not award twice");
var achievement=new AchievementRule("first","first-step","First Step","TASKS",1,300);
Check(Evaluate(State() with{Achievements=[achievement]}).XpEarned==450,"Achievement conditions award XP on the server");
Check(Evaluate(State() with{Achievements=[achievement],UnlockedIds=["first"]}).XpEarned==150,"Unlocked achievements cannot award again");
Check(Evaluate(State() with{Student=State().Student with{TotalXP=400}}).Level==2,"XP threshold calculates new level");
Check(engine.LevelFor(8999)==5&&engine.LevelFor(9000)==6,"Level threshold boundaries are exact");
Check(Evaluate(State() with{Student=State().Student with{LongestStreak=9},LastDate="2026-10-01"}).LongestStreak==9,"Longest streak survives a broken current streak");
Check(Evaluate(State(),"INT").IsCorrect,"Answer comparison is case insensitive");
Check(Evaluate(State(),"wrong").Explanation=="","Wrong answers do not reveal explanations or the correct answer");
var validator=new RegisterValidator();
Check(validator.Validate(new RegisterRequest("Test","Student","test@example.com","Abcdef1!","Abcdef1!")).IsValid,"An 8-character password is accepted on the server");
Check(validator.Validate(new RegisterRequest("Test","Student","test@example.com","Abcde1!","Abcde1!")).Errors.Any(e=>e.ErrorCode=="passwordShort"),"A 7-character password returns a translatable validation code");
var clock=new DateTimeOffset(2026,10,8,12,0,0,TimeSpan.Zero);
QuizQuestion Question(string id)=>new(id,"Variables","Choose an integer type","int",[new("a","int"),new("b","string"),new("c","bool")]);
MultiplayerRoom Room()=>new("ABC234","one","C#",[Question("q1"),Question("q2")],20,clock);
void Rule(Action action,string code,string name){try{action();Check(false,name);}catch(GameRuleException ex){Check(ex.Message==code,name);}}
var room=Room();room.Join("one","Player One","c1",clock);
Rule(()=>room.Start("one",clock),"needPlayers","Multiplayer needs at least two connected players");
room.Join("two","Player Two","c2",clock);
Rule(()=>room.Start("two",clock),"hostOnly","Only the host can start a match");
room.Start("one",clock);
var serialized=JsonSerializer.Serialize(room.View("one",clock));
Check(!serialized.Contains("CorrectAnswer")&&!serialized.Contains("Explanation"),"Public multiplayer snapshots contain no answer key or explanation");
Rule(()=>room.Join("three","Late player","c3",clock),"gameStarted","New players cannot join a match in progress");
room.Submit("one","q1","b",clock.AddSeconds(1));
Check(room.View("one",clock).OwnCorrect==null&&room.Players["one"].Score==0,"Submitted answers receive no correctness feedback before the round closes");
Check(room.View("two",clock).Players.All(p=>p.IsCorrect==null)&&room.View("two",clock).CorrectOptionId==null,"Other students cannot inspect per-player correctness or the answer key while answering");
Check(room.View("two",clock).OwnAnswerId==null&&room.View("two",clock).OwnCorrect==null,"Players cannot see another player's submitted choice or correctness");
room.Submit("one","q1","a",clock.AddSeconds(2));
Check(room.View("one",clock).OwnAnswerId=="a"&&room.Players["one"].Score==0,"A player can replace a mistaken answer without awarding points early");
room.Submit("one","q1","b",clock.AddSeconds(3));
Rule(()=>room.Submit("two","q0","a",clock.AddSeconds(2)),"roundClosed","Stale submissions cannot answer another question");
Rule(()=>room.Submit("two","q1","unknown",clock.AddSeconds(2)),"invalidAnswer","Only existing answer option IDs are accepted");
room.Submit("two","q1","a",clock.AddSeconds(2));
Check(room.Status=="question"&&room.View("one",clock).OwnCorrect==null,"Even when everyone has selected, answers remain editable and private until the deadline");
room.Tick(clock.AddSeconds(20));
Check(room.Status=="results"&&room.Players["two"].Score==1450,"The deadline publishes only the final selections with server-calculated speed points");
Check(room.View("one",clock).OwnCorrect==false&&room.View("two",clock).OwnCorrect==true,"Correctness is revealed to both students together after all submissions");
Check(room.View("one",clock).Players.Single(p=>p.Id=="two").IsCorrect==true&&room.View("one",clock).Players.Single(p=>p.Id=="one").IsCorrect==false&&room.View("one",clock).CorrectOptionId=="a","Public result snapshots expose red/green station outcomes and the correct option only after the round");
Rule(()=>room.Submit("two","q1","a",clock.AddSeconds(21)),"roundClosed","Closed rounds reject further submissions");
Check(room.Tick(clock.AddSeconds(26))&&room.Status=="question"&&room.RoundIndex==1,"The server automatically advances to the next question");
Check(room.View("one",clock).OwnAnswerId==null,"The next question clears previous answers");
Rule(()=>room.Submit("one","q2","a",clock.AddSeconds(46)),"roundClosed","Server deadlines reject late answers");
Check(room.Tick(clock.AddSeconds(46))&&room.Status=="results","The timer ends rounds even when a player never answers");
Check(room.View("two",clock).OwnCorrect==false&&room.View("two",clock).Players.All(p=>p.IsCorrect==false),"Students who time out receive the wrong-answer result at the shared reveal");
room.NextRound("one",clock.AddSeconds(47));
Check(room.Status=="finished"&&room.View("one",clock).Question==null,"The match ends after the configured questions");
var reconnect=Room();reconnect.Join("one","One","c1",clock);reconnect.Join("two","Two","c2",clock);reconnect.Start("one",clock);reconnect.Submit("one","q1","a",clock.AddSeconds(1));reconnect.Disconnect("c1",clock.AddSeconds(2));
Check(reconnect.HostId=="one","The room creator keeps ownership when disconnecting");
Rule(()=>reconnect.Start("two",clock.AddSeconds(3)),"hostOnly","A different player cannot start a match after the creator disconnects");
reconnect.Join("one","One","new-c1",clock.AddSeconds(3));
Check(reconnect.Players.Count==2&&reconnect.Players["one"].Score==0&&reconnect.View("one",clock).OwnAnswerId=="a"&&reconnect.View("one",clock).OwnCorrect==null,"Reconnection preserves the submitted answer without prematurely disclosing correctness or points");
Check(reconnect.View("two",clock).Players.Select(p=>p.Id).SequenceEqual(new[]{"one","two"}),"Correct submissions cannot change the public leaderboard order before reveal");
reconnect.Submit("two","q1","b",clock.AddSeconds(4));
reconnect.Tick(clock.AddSeconds(20));
Check(reconnect.Players["one"].Score==1475&&reconnect.View("two",clock).Players.Single(p=>p.Id=="one").IsCorrect==true,"A reconnected student's original speed bonus is published at the shared result");
var leaving=Room();leaving.Join("one","One","c1",clock);leaving.Join("two","Two","c2",clock);leaving.Join("three","Three","c3",clock);leaving.Start("one",clock);leaving.Submit("one","q1","a",clock.AddSeconds(1));leaving.Leave("one",clock.AddSeconds(2));leaving.Submit("two","q1","a",clock.AddSeconds(3));
Check(leaving.Status=="question","An answer from a player who left cannot end the round before remaining players answer");
Check(leaving.View("two",clock).Revision>0,"Snapshots carry a revision to reject out-of-order multiplayer updates");
var full=Room();for(var i=0;i<16;i++)full.Join(i.ToString(),"Player "+i,"connection"+i,clock);
Check(full.Players.Count==16,"Online rooms have no eight-player cap");
Console.WriteLine($"{count} domain checks passed.");
var studioRoom=new MultiplayerRoom("TV2345","one","Text quiz",[Question("q1"),Question("q2")],10,clock,4);
studioRoom.Join("one","One","c1",clock,"maya");studioRoom.Join("two","Two","c2",clock,"leo");studioRoom.Start("one",clock);
Check(studioRoom.Status=="preview"&&studioRoom.View("one",clock).Question!=null,"Studio starts on the television with a public question");
Check(studioRoom.View("one",clock).AnswerOpensAt==clock.AddSeconds(4)&&studioRoom.Deadline==clock.AddSeconds(14),"Reading and camera return do not consume answer time");
Rule(()=>studioRoom.Submit("one","q1","a",clock.AddSeconds(3)),"roundClosed","Answers are rejected during television presentation");
Check(!studioRoom.Tick(clock.AddSeconds(3))&&studioRoom.Status=="preview","The television holds for three seconds before the camera returns");
Check(studioRoom.Tick(clock.AddSeconds(4))&&studioRoom.Status=="question","The shared server clock opens answers after the presentation");
studioRoom.Submit("one","q1","a",clock.AddSeconds(4));studioRoom.Submit("two","q1","b",clock.AddSeconds(5));
studioRoom.Tick(clock.AddSeconds(14));
Check(studioRoom.Players["one"].Score==1500,"The presentation never reduces the speed bonus");
studioRoom.NextRound("one",clock.AddSeconds(15));
Check(studioRoom.Status=="preview"&&studioRoom.View("one",clock).AnswerOpensAt==clock.AddSeconds(19),"Every new question gets a fresh presentation window");
Check(studioRoom.View("one",clock).Players.Single(p=>p.Id=="one").AvatarId=="maya","Selected 3D characters survive room snapshots");
var lobbyCharacters=Room();lobbyCharacters.Join("one","One","c1",clock);lobbyCharacters.Join("two","Two","c2",clock);
lobbyCharacters.SelectCharacter("one","atlas",clock);
Check(lobbyCharacters.View("two",clock).Players.Single(p=>p.Id=="one").AvatarId=="atlas","Lobby character changes are shared with friends");
Rule(()=>lobbyCharacters.SelectCharacter("one","unknown",clock),"invalidCharacter","Unknown lobby characters are rejected");
lobbyCharacters.Start("one",clock);
Rule(()=>lobbyCharacters.SelectCharacter("one","maya",clock),"gameStarted","Characters cannot be changed during an active match");
var source="Mercury is the closest planet to the Sun. Mars is called the red planet.";
System.Text.Json.Nodes.JsonNode Generated(string evidence="Mercury is the closest planet to the Sun.")=>System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(new{questions=new[]{new{question="Which planet is closest to the Sun?",options=new[]{"Mercury","Venus","Earth","Mars"},correctAnswer="Mercury",evidence}}}))!;
Check(GroundedQuiz.Parse(Generated(),"Planets",source,1).Single().CorrectAnswer=="Mercury","A generated quiz uses a fact and exact quote from the supplied source");
Rule(()=>GroundedQuiz.Parse(Generated("Mercury has rings."),"Planets",source,1),"invalidGeneratedQuiz","Generated evidence absent from the source is rejected");
Rule(()=>GroundedQuiz.Parse(Generated(),"Planets",source,2),"insufficientSourceFacts","Generation cannot quietly reduce the requested question count");
var invalid=Generated();invalid["questions"]![0]!["options"]![1]="Mercury";
Rule(()=>GroundedQuiz.Parse(invalid,"Planets",source,1),"invalidGeneratedQuiz","Duplicate or ambiguous options are rejected");
invalid=Generated();invalid["questions"]![0]!["correctAnswer"]="Venus";
Rule(()=>GroundedQuiz.Parse(invalid,"Planets",source,1),"invalidGeneratedQuiz","An answer unsupported by the cited source quote is rejected");
var kazakhSource = "INTEGER бүтін сандарды, REAL бөлшек сандарды сақтайды.";
var kazakhQuiz = System.Text.Json.Nodes.JsonNode.Parse("""
{"questions":[{"question":"INTEGER қандай мәліметтерді сақтайды?","options":["Бүтін сандарды","Мәтіндерді","Бинарлық деректерді","Бөлшек сандарды"],"correctAnswer":"бүтін сандарды","evidence":"INTEGER  бүтін\nсандарды, REAL бөлшек сандарды сақтайды."}]}
""")!;
Check(GroundedQuiz.Parse(kazakhQuiz,"SQLite",kazakhSource,1).Single().CorrectAnswer=="Бүтін сандарды","Kazakh answers tolerate case and whitespace while scoring uses the exact option");
kazakhQuiz["questions"]![0]!["evidence"]="INTEGER мәтіндерді сақтайды.";
Rule(()=>GroundedQuiz.Parse(kazakhQuiz,"SQLite",kazakhSource,1),"invalidGeneratedQuiz","Normalization still rejects changed facts");
Check(GroundedQuiz.ValidationFeedback(kazakhQuiz,kazakhSource).Contains("question 1: evidence"),"Correction identifies the failed question and field without logging learning text");
kazakhQuiz["questions"]![0]!["evidence"]=kazakhSource;
kazakhQuiz["questions"]![0]!["options"]![1]="Бүтін  сандарды";
Rule(()=>GroundedQuiz.Parse(kazakhQuiz,"SQLite",kazakhSource,1),"invalidGeneratedQuiz","Whitespace cannot disguise duplicate answer options");
var repository = new QuizSettingsRepository();
var providerHandler = new QuizProviderHandler();
var providerConfig = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["AI:ApiKey"]="test-key", ["AI:Model"]="test-model", ["AI:BaseUrl"]="https://provider.test/v1" }).Build();
var provider = new GamifiedLearningSystem.Infrastructure.Services.OpenAIService(new(repository), repository, new HttpClient(providerHandler), providerConfig, Microsoft.Extensions.Logging.Abstractions.NullLogger<GamifiedLearningSystem.Infrastructure.Services.OpenAIService>.Instance);
var corrected = await provider.GenerateQuizAsync("SQLite",kazakhSource,1,CancellationToken.None);
Check(providerHandler.Calls==2 && GroundedQuiz.Parse(corrected,"SQLite",kazakhSource,1).Count==1,"Provider corrects an unsupported Kazakh answer instead of rejecting the entire room");
Check(providerHandler.Prompts[0].Contains("бүтін сандарды") && !providerHandler.Prompts[0].Contains("\\u"),"Kazakh learning text reaches the provider as readable letters");
Check(corrected["questions"]![0]!["evidence"]!.GetValue<string>()==kazakhSource,"Evidence comes from the original server-owned sentence");
Check(providerHandler.Prompts[1].Contains("question 1: correctAnswer"),"A retry receives the failed field and previous response");
var partialHandler = new QuizProviderHandler { Partial=true };
var partialProvider = new GamifiedLearningSystem.Infrastructure.Services.OpenAIService(new(repository),repository,new HttpClient(partialHandler),providerConfig,Microsoft.Extensions.Logging.Abstractions.NullLogger<GamifiedLearningSystem.Infrastructure.Services.OpenAIService>.Instance);
var completedQuiz=await partialProvider.GenerateQuizAsync("SQLite","INTEGER бүтін сандарды сақтайды. REAL бөлшек сандарды сақтайды.",2,CancellationToken.None);
Check(partialHandler.Calls==2 && completedQuiz["questions"]!.AsArray().Count==2,"Valid questions survive while unsupported questions are replaced");
Check(partialHandler.Prompts[1].Contains("\"count\":1") && partialHandler.Prompts[1].Contains("alreadyAcceptedQuestions"),"Only the missing question is requested again, excluding accepted questions");
var invalidIdHandler=new QuizProviderHandler { InvalidId=true };
var invalidIdProvider=new GamifiedLearningSystem.Infrastructure.Services.OpenAIService(new(repository),repository,new HttpClient(invalidIdHandler),providerConfig,Microsoft.Extensions.Logging.Abstractions.NullLogger<GamifiedLearningSystem.Infrastructure.Services.OpenAIService>.Instance);
try { await invalidIdProvider.GenerateQuizAsync("SQLite",kazakhSource,1,CancellationToken.None); Check(false,"Unknown source references are rejected"); }
catch(GameRuleException ex) { Check(ex.Message=="invalidGeneratedQuiz" && invalidIdHandler.Calls==3,"Unknown source references are rejected after bounded retries"); }
var translationHandler=new TranslationProviderHandler();
var translationProvider=new GamifiedLearningSystem.Infrastructure.Services.OpenAIService(new(repository),repository,new HttpClient(translationHandler),providerConfig,Microsoft.Extensions.Logging.Abstractions.NullLogger<GamifiedLearningSystem.Infrastructure.Services.OpenAIService>.Instance);
var englishViews=new List<QuizQuestionView>{new("lang-q","Planets","Which planet is closest to the Sun?",[new("lang-a","Mercury"),new("lang-b","Venus"),new("lang-c","Earth"),new("lang-d","Mars")])};
var russian=await translationProvider.TranslateQuizAsync("Planets",englishViews,"ru",CancellationToken.None);
var kazakh=await translationProvider.TranslateQuizAsync("Planets",englishViews,"kk",CancellationToken.None);
Check(russian.Questions.Single().Question=="Какая планета ближе всего к Солнцу?"&&kazakh.Questions.Single().Question=="Күнге ең жақын ғаламшар қайсы?","The same immutable quiz has Russian and Kazakh display text");
Check(translationHandler.Prompts[0].Contains("Russian")&&translationHandler.Prompts[1].Contains("Kazakh"),"The selected UI language explicitly controls provider translation");
Check(translationHandler.Prompts.All(p=>!p.Contains("correctAnswer")&&!p.Contains("evidence")),"Translation requests contain no correct answer or source evidence");
Check(kazakh.Questions.Single().Options.Select(o=>o.Id).SequenceEqual(englishViews.Single().Options.Select(o=>o.Id)),"Translated options retain their server-owned IDs and order");
var translatedCanonical=QuizLocalization.ApplyToCanonical([new("lang-q","Planets",englishViews[0].Question,"Mercury",englishViews[0].Options)],kazakh);
Check(translatedCanonical[0].Question==kazakh.Questions[0].Question&&translatedCanonical[0].CorrectAnswer==kazakh.Questions[0].Options.Single(o=>o.Id=="lang-a").Text&&translatedCanonical[0].Options[0].Id=="lang-a","Saving generated questions in the selected language preserves the correct option by ID");
var localizedRoom=new MultiplayerRoom("LANG23","one","Planets",[new("lang-q","Planets","Which planet is closest to the Sun?","Mercury",englishViews.Single().Options)],20,clock,5);
localizedRoom.AddTranslation("ru",russian);localizedRoom.AddTranslation("kk",kazakh);
localizedRoom.Join("one","One","c1",clock);localizedRoom.Join("two","Two","c2",clock);
localizedRoom.SetLanguage("one","kk",clock);localizedRoom.SetLanguage("two","ru",clock);localizedRoom.Start("one",clock);
Check(localizedRoom.View("one",clock).Question!.Question==kazakh.Questions[0].Question&&localizedRoom.View("two",clock).Question!.Question==russian.Questions[0].Question,"Each student sees their selected language in the same room");
Check(localizedRoom.View("one",clock).AnswerOpensAt==clock.AddSeconds(5),"Studio questions reserve three seconds on television and two seconds for camera movement");
localizedRoom.Tick(clock.AddSeconds(5));localizedRoom.Submit("one","lang-q","lang-a",clock.AddSeconds(6));
var beforeSwitch=localizedRoom.View("one",clock.AddSeconds(6));localizedRoom.SetLanguage("one","ru",clock.AddSeconds(7));
var afterSwitch=localizedRoom.View("one",clock.AddSeconds(7));
Check(afterSwitch.Language=="ru"&&afterSwitch.OwnAnswerId==beforeSwitch.OwnAnswerId&&afterSwitch.Deadline==beforeSwitch.Deadline&&afterSwitch.OwnCorrect==null&&afterSwitch.Players.All(p=>p.Score==0),"Changing language during a question preserves the answer, deadline and private scoring");
localizedRoom.Submit("two","lang-q","lang-b",clock.AddSeconds(8));
localizedRoom.Tick(clock.AddSeconds(25));
Check(localizedRoom.View("one",clock).OwnCorrect==true&&localizedRoom.View("one",clock).CorrectOptionId=="lang-a"&&localizedRoom.Players["one"].Score==1475,"A translated correct option is scored against the canonical quiz using its immutable ID");
Rule(()=>QuizLocalization.RequireLanguage("fr"),"invalidLanguage","Unsupported client locales are rejected");
var invalidTranslation=JsonSerializer.SerializeToNode(kazakh,new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
invalidTranslation["questions"]![0]!["options"]![0]!["id"]="invented-id";
Rule(()=>QuizLocalization.Parse(invalidTranslation,englishViews),"translationFailed","Translation cannot replace an option ID and change the scoring contract");
invalidTranslation=JsonSerializer.SerializeToNode(kazakh,new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
invalidTranslation["questions"]![0]!["options"]![1]!["text"]=invalidTranslation["questions"]![0]!["options"]![0]!["text"]!.DeepClone();
Rule(()=>QuizLocalization.Parse(invalidTranslation,englishViews),"translationFailed","Translations cannot collapse distinct answer options into ambiguous duplicates");
var showRepository=new ShowLanguageRepository { Snapshot=JsonSerializer.SerializeToNode(new {gameSnapshot=State(),canonicalAnswer="int",taskSessionId="session",showVersion=1,wager=0,receivedAt="2026-10-12T12:00:00Z"})! };
var localizedShow=new GamifiedLearningSystem.Application.Services.ShowService(showRepository,engine);
await localizedShow.CatalogAsync("student",CancellationToken.None,"kk");
await localizedShow.ReadAsync("student",null,CancellationToken.None,"en");
await localizedShow.ReadAsync("student","show-id",CancellationToken.None,"kk");
Check(showRepository.Requests.Where(r=>r.Method==HttpMethod.Get).All(r=>r.Path.Contains("language="))&&showRepository.Requests[0].Path.EndsWith("language=kk"),"Solo catalog, active session and direct reads carry the selected language");
await localizedShow.StartAsync("student",new("course","nova",Language:"kk"),CancellationToken.None);
await localizedShow.NextAsync("student","show-id",new(0,"en"),CancellationToken.None);
await localizedShow.HintAsync("student","show-id",new(0,"kk"),CancellationToken.None);
await localizedShow.WagerAsync("student","show-id",new(0,20,"ru"),CancellationToken.None);
await localizedShow.AbandonAsync("student","show-id",CancellationToken.None,"kk");
Check(showRepository.Requests.Where(r=>r.Method==HttpMethod.Post).Select(r=>r.Body!["language"]!.GetValue<string>()).SequenceEqual(new[]{"kk","en","kk","ru","kk"}),"Solo start, next, hint, wager and exit actions preserve their requested language");
await localizedShow.AnswerAsync("student","show-id",new(0,"int",Guid.NewGuid().ToString(),Language:"kk"),CancellationToken.None);
Check(showRepository.Requests.TakeLast(2).All(r=>r.Body?["language"]?.GetValue<string>()=="kk"),"Both private answer evaluation and committed feedback use the selected solo language");
try { await localizedShow.CatalogAsync("student",CancellationToken.None,"invalid");Check(false,"Invalid solo languages are rejected before reaching the data service"); }
catch(GamifiedLearningSystem.Application.Services.DataException ex) {Check(ex.Status==400&&ex.Message=="invalidLanguage","Invalid solo languages are rejected before reaching the data service");}
var imported=ReadyQuiz.Parse("1. Two plus two?\nA) 3\nB) 4\nAnswer: B\n\n2. Three plus three?\nA) 6\nB) 7\nAnswer: A", "Math");
Check(imported.Count==2&&imported[0].CorrectAnswer=="4"&&imported[1].CorrectAnswer=="6","Ready tests preserve authored questions and letter answer keys");
var importedJson=ReadyQuiz.Parse("[{\"question\":\"What is water?\",\"options\":[\"H2O\",\"CO2\"],\"correctAnswer\":\"H2O\"}]","Chemistry");
Check(importedJson[0].Options.Count==2&&importedJson[0].CorrectAnswer=="H2O","JSON imports preserve exact answer keys");
Rule(()=>ReadyQuiz.Parse("1. Missing answer?\nA) Yes\nB) No","Invalid"),"invalidReadyQuiz","An imported test without an answer key is rejected");
var sqlWorksheet = """
SQL бойынша тест
Аты-жөні: __________________________    Сыныбы: __________
Нұсқаулық: әр сұраққа бір дұрыс жауапты таңдаңыз. Әр дұрыс жауапқа 1 ұпай беріледі. Барлығы 5 ұпай.
1. SQL тілінде кестеден деректерді таңдап алу үшін қай оператор қолданылады?
A) DELETE
B) SELECT
C) UPDATE
D) INSERT
2. Сұраныста жолдарды берілген шарт бойынша сүзу үшін қай сөйлем қолданылады?
A) ORDER BY
B) GROUP BY
C) WHERE
D) FROM
3. Кестеге жаңа жол қосу үшін қай команда қолданылады?
A) INSERT INTO
B) ALTER TABLE
C) DROP TABLE
D) SELECT
4. Students кестесіндегі id мәні 3 болатын оқушының age мәнін 18-ге өзгертетін дұрыс сұранысты таңдаңыз.
A) SELECT age = 18 FROM Students WHERE id = 3;
B) INSERT INTO Students SET age = 18 WHERE id = 3;
C) DELETE FROM Students WHERE id = 3;
D) UPDATE Students SET age = 18 WHERE id = 3;
5. Деректерді name бағаны бойынша өсу ретімен сұрыптау үшін қай сөйлем қолданылады?
A) GROUP BY name
B) ORDER BY name ASC
C) WHERE name ASC
D) ORDER BY name DESC
Жауаптар кілті
1 — B    2 — C    3 — A    4 — D    5 — B
""";
var sqlImport=ReadyQuiz.Parse(sqlWorksheet,"SQL бойынша тест");
Check(sqlImport.Count==5&&sqlImport.All(q=>q.Options.Count==4)&&sqlImport.Select(q=>q.CorrectAnswer).SequenceEqual(new[]{"SELECT","WHERE","INSERT INTO","UPDATE Students SET age = 18 WHERE id = 3;","ORDER BY name ASC"}),"The exact Kazakh SQL worksheet imports five questions with its separate answer key");
Check(sqlImport[0].Question.StartsWith("SQL тілінде")&&sqlImport[3].Options[3].Text=="UPDATE Students SET age = 18 WHERE id = 3;","Worksheet headers are excluded and SQL statements are preserved verbatim");
foreach(var keyHeading in new[]{"Ключ ответов:","Answer key:"})
    Check(ReadyQuiz.Parse(sqlWorksheet.Replace("Жауаптар кілті",keyHeading).Replace(" — "," - ").Replace("    ","\n"),"SQL").Count==5,"Russian/English answer key headings and multiline keys are supported: "+keyHeading);
Check(ReadyQuiz.Parse("7. Choose one?\nA) One\nB) Two\n9. Choose three?\nA) Three\nB) Four\nЖауаптар кілті: 9 — A  7 — B","Numbers").Select(q=>q.CorrectAnswer).SequenceEqual(new[]{"Two","Three"}),"Separate keys map by the printed question number rather than their order");
Rule(()=>ReadyQuiz.Parse(sqlWorksheet.Replace("5 — B",""),"SQL"),"invalidReadyQuiz","A missing worksheet answer is rejected rather than guessed");
Rule(()=>ReadyQuiz.Parse(sqlWorksheet+"\n1 — A","SQL"),"invalidReadyQuiz","Duplicate answer key entries are rejected");
Rule(()=>ReadyQuiz.Parse(sqlWorksheet+"\n6 — A","SQL"),"invalidReadyQuiz","An answer key for a nonexistent question is rejected");
Rule(()=>ReadyQuiz.Parse(sqlWorksheet.Replace("1 — B","1 — H"),"SQL"),"invalidReadyQuiz","A key outside the question's options is rejected");
Rule(()=>ReadyQuiz.Parse(sqlWorksheet.Replace("Жауаптар кілті","Answer: A\nЖауаптар кілті"),"SQL"),"invalidReadyQuiz","Conflicting inline and separate answer keys are rejected");
Rule(()=>ReadyQuiz.Parse(sqlWorksheet+"\nunclear answer","SQL"),"invalidReadyQuiz","Unrecognized content in the answer key cannot be silently discarded");
var practice=new MultiplayerRoom("BOT234","one","Practice",imported,20,clock,5);
practice.Join("one","Student","practice-connection",clock,"nova");practice.AddBots(clock);practice.Start("one",clock);
Check(practice.Players.Count==4&&practice.Players.Values.Count(p=>p.IsBot)==3,"Saved quiz practice includes three real server-controlled bots");
Rule(()=>practice.Join("outsider","Guest","guest",clock),"roomNotFound","Other players cannot enter a private bot practice");
practice.Tick(clock.AddSeconds(5));practice.Submit("one",imported[0].Id,imported[0].Options.Single(o=>o.Text=="3").Id,clock.AddSeconds(6));
practice.Submit("one",imported[0].Id,imported[0].Options.Single(o=>o.Text=="4").Id,clock.AddSeconds(7));
Check(practice.Status=="question"&&practice.View("one",clock).OwnCorrect==null,"Bot practice lets the player correct a choice before confirming");
practice.ConfirmSoloAnswer("one",imported[0].Id,imported[0].Options.Single(o=>o.Text=="4").Id,clock.AddSeconds(7));
Check(practice.Status=="results"&&practice.View("one",clock).Players.All(p=>p.Answered),"Confirming the human answer resolves every bot immediately");
var practiceResult=practice.View("one",clock.AddSeconds(22));
Check(practiceResult.Status=="results"&&practiceResult.OwnPoints>1000&&practiceResult.Players.Single(p=>p.Id=="one").Score>1000,"Bot practice awards and displays server-calculated match points");
Rule(()=>practice.ConfirmSoloAnswer("one",imported[0].Id,imported[0].Options.Single(o=>o.Text=="4").Id,clock.AddSeconds(8)),"roundClosed","A confirmed bot answer cannot award points twice");
practice.Tick(clock.AddSeconds(8));
Check(practice.View("one",clock.AddSeconds(23)).Players.Single(p=>p.Id=="one").Score==practiceResult.Players.Single(p=>p.Id=="one").Score,"Repeated bot ticks never award points twice");
Console.WriteLine($"{count} total checks passed.");

sealed class QuizSettingsRepository : GamifiedLearningSystem.Application.Interfaces.IDataRepository {
    public Task<System.Text.Json.Nodes.JsonNode> SendAsync(HttpMethod method,string path,object? body,CancellationToken ct) => Task.FromResult<System.Text.Json.Nodes.JsonNode>(new System.Text.Json.Nodes.JsonArray());
}
sealed class QuizProviderHandler : HttpMessageHandler {
    public bool Partial { get; init; }
    public bool InvalidId { get; init; }
    public int Calls { get; private set; }
    public List<string> Prompts { get; } = [];
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct) {
        var payload = System.Text.Json.Nodes.JsonNode.Parse(await request.Content!.ReadAsStringAsync(ct))!;
        Prompts.Add(payload["messages"]![1]!["content"]!.GetValue<string>());
        Calls++;
        var answer=Calls==1 ? "Мәтіндерді" : "Бүтін сандарды";
        var quiz=JsonSerializer.Serialize(new { questions=new[] { new { question="INTEGER қандай мәліметтерді сақтайды?", options=new[]{"Бүтін сандарды","Мәтіндерді","Бинарлық деректерді","Бөлшек сандарды"}, correctAnswer=answer,evidenceId=InvalidId?999:0 } } });
        if (Partial) {
            var first=new { question="INTEGER қандай мәліметтерді сақтайды?",options=new[]{"Бүтін сандарды","Мәтіндерді","Бинарлық деректерді","Бөлшек сандарды"},correctAnswer="Бүтін сандарды",evidenceId=0 };
            var second=new { question="REAL қандай мәліметтерді сақтайды?",options=new[]{"Бүтін сандарды","Мәтіндерді","Бинарлық деректерді","Бөлшек сандарды"},correctAnswer=Calls==1?"Мәтіндерді":"Бөлшек сандарды",evidenceId=1 };
            quiz=JsonSerializer.Serialize(new { questions=Calls==1?new[]{first,second}:new[]{second} });
        }
        return new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content=new StringContent(JsonSerializer.Serialize(new { choices=new[] { new { message=new { content=quiz } } } }),System.Text.Encoding.UTF8,"application/json") };
    }
}

sealed class TranslationProviderHandler : HttpMessageHandler {
    public List<string> Prompts { get; }=[];
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct) {
        var payload=System.Text.Json.Nodes.JsonNode.Parse(await request.Content!.ReadAsStringAsync(ct))!;
        var prompt=payload["messages"]![1]!["content"]!.GetValue<string>();Prompts.Add(prompt);
        var kk=prompt.Contains("to Kazakh");
        var quiz=JsonSerializer.Serialize(new { courseTitle=kk?"Ғаламшарлар":"Планеты",questions=new[] {new {id="lang-q",title=kk?"Ғаламшарлар":"Планеты",question=kk?"Күнге ең жақын ғаламшар қайсы?":"Какая планета ближе всего к Солнцу?",options=new[] {new {id="lang-a",text=kk?"Меркурий":"Меркурий"},new {id="lang-b",text="Венера"},new {id="lang-c",text=kk?"Жер":"Земля"},new {id="lang-d",text="Марс"}}}}});
        return new HttpResponseMessage(System.Net.HttpStatusCode.OK) {Content=new StringContent(JsonSerializer.Serialize(new {choices=new[] {new {message=new {content=quiz}}}}),System.Text.Encoding.UTF8,"application/json")};
    }
}

sealed class ShowLanguageRepository : GamifiedLearningSystem.Application.Interfaces.IDataRepository {
    public required System.Text.Json.Nodes.JsonNode Snapshot {get;init;}
    public List<(HttpMethod Method,string Path,System.Text.Json.Nodes.JsonNode? Body)> Requests {get;}=[];
    public Task<System.Text.Json.Nodes.JsonNode> SendAsync(HttpMethod method,string path,object? body,CancellationToken ct) {
        Requests.Add((method,path,body is null?null:JsonSerializer.SerializeToNode(body,new JsonSerializerOptions(JsonSerializerDefaults.Web))));
        if(path.EndsWith("/snapshot"))return Task.FromResult(Snapshot.DeepClone());
        return Task.FromResult<System.Text.Json.Nodes.JsonNode>(new System.Text.Json.Nodes.JsonObject { ["session"]=new System.Text.Json.Nodes.JsonObject() });
    }
}
