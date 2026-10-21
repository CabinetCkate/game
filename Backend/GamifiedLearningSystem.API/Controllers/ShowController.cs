using System.Text.Json.Nodes;
using GamifiedLearningSystem.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GamifiedLearningSystem.API.Controllers;

[ApiController, Authorize(Roles = "STUDENT"), Route("api/show")]
public sealed class ShowController(ShowService service) : ControllerBase
{
    private string StudentId => User.FindFirst("studentId")?.Value
        ?? throw new DataException(403, "A student account is required.");
    [HttpGet("catalog")] public Task<JsonNode> Catalog(CancellationToken ct, [FromQuery] string language = "ru") => service.CatalogAsync(StudentId, ct, language);
    [HttpGet("active")] public async Task<IActionResult> Active(CancellationToken ct, [FromQuery] string language = "ru") =>
        new JsonResult(await service.ReadAsync(StudentId, null, ct, language));
    [HttpGet("{id}")] public Task<JsonNode?> Get(string id, CancellationToken ct, [FromQuery] string language = "ru") => service.ReadAsync(StudentId, id, ct, language);
    [HttpPost("start")] public Task<JsonNode> Start(ShowStartRequest request, CancellationToken ct) => service.StartAsync(StudentId, request, ct);
    [HttpPost("{id}/next")] public Task<JsonNode> Next(string id, ShowQuestionRequest request, CancellationToken ct) => service.NextAsync(StudentId, id, request, ct);
    [HttpPost("{id}/answer")] public Task<JsonNode> Answer(string id, ShowAnswerRequest request, CancellationToken ct) => service.AnswerAsync(StudentId, id, request, ct);
    [HttpPost("{id}/hint")] public Task<JsonNode> Hint(string id, ShowQuestionRequest request, CancellationToken ct) => service.HintAsync(StudentId, id, request, ct);
    [HttpPost("{id}/wager")] public Task<JsonNode> Wager(string id, ShowWagerRequest request, CancellationToken ct) => service.WagerAsync(StudentId, id, request, ct);
    [HttpPost("{id}/abandon")] public Task<JsonNode> Abandon(string id, CancellationToken ct,
        [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] ShowLanguageRequest? request = null) => service.AbandonAsync(StudentId, id, ct, request?.Language ?? "ru");
}
