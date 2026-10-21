using System.Text.Json;
using System.Text.Json.Nodes;
using FluentValidation;
using GamifiedLearningSystem.Application.DTOs;
using GamifiedLearningSystem.Application.Interfaces;
using GamifiedLearningSystem.Application.Validators;
using GamifiedLearningSystem.Domain;
using GamifiedLearningSystem.Domain.Entities;
namespace GamifiedLearningSystem.Application.Services;

public sealed class LearningService(IDataRepository data, GamificationEngine engine)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public Task<JsonNode> ReadAsync(string resource, string? studentId, CancellationToken ct) => data.SendAsync(HttpMethod.Get, resource + (resource.Contains('?') ? "&" : "?") + "studentId=" + Uri.EscapeDataString(studentId ?? ""), null, ct);
    public Task<JsonNode> WriteAsync(string resource, object body, CancellationToken ct) => data.SendAsync(HttpMethod.Post, resource, body, ct);
    public async Task<JsonNode> SubmitAsync(string studentId, string taskId, AttemptRequest request, CancellationToken ct)
    {
        await new AttemptValidator().ValidateAndThrowAsync(request, ct);
        for (var retry = 0; retry < 4; retry++) {
            var snapshot = await data.SendAsync(HttpMethod.Post, "game/snapshot", new { studentId, taskId, request.SessionId, request.RequestId, request.Answer }, ct);
            if (snapshot["replayed"] is not null) {
                var replay=snapshot["replayed"]!.DeepClone();
                if(replay["isCorrect"]?.GetValue<bool>()!=true)replay["explanation"]="";
                return replay;
            }
            var state = snapshot.Deserialize<GameSnapshot>(Json) ?? throw new InvalidOperationException("Invalid game state.");
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Asia/Qyzylorda"));
            var canonical = snapshot["canonicalAnswer"]?.GetValue<string>() ?? request.Answer;
            var plan = engine.Evaluate(state, canonical, request.SessionId, request.RequestId, today) with { Answer = request.Answer };
            try { return await data.SendAsync(HttpMethod.Post, "game/commit", plan, ct); }
            catch (DataException ex) when (ex.Status == 409 && retry < 3) { }
        }
        throw new DataException(409, "Progress changed; please retry.");
    }
}
public sealed class DataException(int status, string message, string? code = null) : Exception(message) { public int Status { get; } = status; public string? Code { get; } = code; }
