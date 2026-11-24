using System.Security.Claims;
using System.Text.Json.Nodes;
using GamifiedLearningSystem.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GamifiedLearningSystem.API.Controllers;

[ApiController,Authorize(Roles="TEACHER"),Route("api/teacher")]
public sealed class TeacherController(IDataRepository data):ControllerBase
{
    private string UserId=>User.FindFirst("sub")?.Value??User.FindFirst(ClaimTypes.NameIdentifier)?.Value??throw new UnauthorizedAccessException();

    [HttpGet("courses")]
    public Task<JsonNode> Courses(CancellationToken ct)=>data.SendAsync(HttpMethod.Get,"teacher/courses?userId="+Uri.EscapeDataString(UserId),null,ct);

    [HttpGet("courses/{id}/statistics")]
    public Task<JsonNode> CourseStatistics(string id,CancellationToken ct)=>data.SendAsync(HttpMethod.Get,"teacher/courses/"+Uri.EscapeDataString(id)+"/statistics?userId="+Uri.EscapeDataString(UserId),null,ct);

    [HttpPost("courses")]
    public Task<JsonNode> CreateCourse(JsonObject body,CancellationToken ct)
    {
        body["userId"]=UserId;
        return data.SendAsync(HttpMethod.Post,"teacher/courses",body,ct);
    }
}
