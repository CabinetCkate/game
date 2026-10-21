using System.Text.Json.Nodes;
using GamifiedLearningSystem.Application.AI;
using GamifiedLearningSystem.Application.DTOs;
using GamifiedLearningSystem.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace GamifiedLearningSystem.API.Controllers;
[ApiController,Authorize,Route("api")]
public sealed class LearningController(LearningService service,IAIService ai,IConfiguration config):ControllerBase
{
 private string StudentId=>User.FindFirst("studentId")?.Value??throw new DataException(403,"A student account is required.");
 [HttpGet("configuration")] public object Configuration()=>new{levelThresholds=config.GetSection("Game:LevelThresholds").Get<int[]>()??new[]{0,500,1200,2500,5000,9000,15000,25000},timezone="Asia/Qyzylorda"};
 [HttpGet("courses")] public Task<JsonNode> Courses(CancellationToken ct)=>service.ReadAsync("courses",StudentId,ct);
 [HttpGet("courses/{id}")] public Task<JsonNode> Course(string id,CancellationToken ct)=>service.ReadAsync("courses/"+Uri.EscapeDataString(id),StudentId,ct);
 [HttpGet("levels/{id}")] public Task<JsonNode> Level(string id,CancellationToken ct)=>service.ReadAsync("levels/"+Uri.EscapeDataString(id),StudentId,ct);
 [HttpGet("tasks/{id}")] public Task<JsonNode> TaskDetail(string id,CancellationToken ct)=>service.ReadAsync("tasks/"+Uri.EscapeDataString(id),StudentId,ct);
 [HttpPost("tasks/{id}/start")] public Task<JsonNode> Start(string id,CancellationToken ct)=>service.WriteAsync("tasks/"+Uri.EscapeDataString(id)+"/start",new{studentId=StudentId},ct);
 [HttpPost("tasks/{id}/attempt")] public Task<JsonNode> Submit(string id,AttemptRequest r,CancellationToken ct)=>service.SubmitAsync(StudentId,id,r,ct);
 [HttpPost("tasks/{id}/report")] public Task<JsonNode> Report(string id,ReportRequest r,CancellationToken ct)=>service.WriteAsync("tasks/"+Uri.EscapeDataString(id)+"/report",new{studentId=StudentId,r.Message},ct);
 [HttpGet("students/me")] public Task<JsonNode> Me(CancellationToken ct)=>service.ReadAsync("students/me",StudentId,ct);
 [HttpGet("students/me/progress")] public Task<JsonNode> Progress(CancellationToken ct)=>service.ReadAsync("students/me/progress",StudentId,ct);
 [HttpPut("students/me")] public Task<JsonNode> Profile(ProfileRequest r,CancellationToken ct)=>service.WriteAsync("students/me",new{studentId=StudentId,r.FirstName,r.LastName,r.Bio,r.AvatarUrl},ct);
 [HttpGet("statistics")] public Task<JsonNode> Statistics(CancellationToken ct)=>service.ReadAsync("statistics",StudentId,ct);
 [HttpGet("achievements"),HttpGet("students/me/achievements")] public Task<JsonNode> Achievements(CancellationToken ct)=>service.ReadAsync("achievements",StudentId,ct);
 [HttpGet("attempts")] public Task<JsonNode> Attempts(CancellationToken ct,int page=1)=>service.ReadAsync("attempts?page="+Math.Max(1,page),StudentId,ct);
 [HttpGet("xp")] public Task<JsonNode> XP(CancellationToken ct)=>service.ReadAsync("xp",StudentId,ct);
 [HttpGet("daily-goals")] public Task<JsonNode> Goals(CancellationToken ct)=>service.ReadAsync("daily-goals",StudentId,ct);
 [HttpGet("streak"),HttpGet("streaks")] public Task<JsonNode> Streak(CancellationToken ct)=>service.ReadAsync("streaks",StudentId,ct);
 [HttpGet("leaderboard")] public Task<JsonNode> Board(CancellationToken ct,string period="global",int page=1)=>service.ReadAsync("leaderboard?period="+Uri.EscapeDataString(period)+"&page="+Math.Max(1,page),StudentId,ct);
 [HttpGet("leaderboard/weekly")] public Task<JsonNode> Weekly(CancellationToken ct)=>service.ReadAsync("leaderboard?period=weekly",StudentId,ct);
 [HttpGet("leaderboard/monthly")] public Task<JsonNode> Monthly(CancellationToken ct)=>service.ReadAsync("leaderboard?period=monthly",StudentId,ct);
 [HttpGet("seasons")] public Task<JsonNode> Seasons(CancellationToken ct)=>service.ReadAsync("seasons",StudentId,ct);
 [HttpGet("notifications")] public Task<JsonNode> Notifications(CancellationToken ct)=>service.ReadAsync("notifications",StudentId,ct);
 [HttpPost("notifications/read")] public Task<JsonNode> ReadNotifications(CancellationToken ct)=>service.WriteAsync("notifications/read",new{studentId=StudentId},ct);
 [HttpGet("ai/next-task")] public Task<JsonNode> NextTask(CancellationToken ct)=>ai.GetNextTaskAsync(StudentId,ct);
 [HttpPost("ai/hint")] public Task<JsonNode> Hint(HintRequest r,CancellationToken ct)=>ai.GenerateHintAsync(StudentId,r.TaskId,ct);
 [HttpPost("ai/analyze")] public Task<JsonNode> Analyze(CancellationToken ct)=>ai.AnalyzeStudentProgressAsync(StudentId,ct);
}
public record ReportRequest(string Message);
