using System.Text.Json;
using System.Text.Json.Nodes;
using GamifiedLearningSystem.Application.Interfaces;
using GamifiedLearningSystem.Domain;
using GamifiedLearningSystem.Domain.Entities;

namespace GamifiedLearningSystem.Application.Services;

/// <summary>All public actions bind ownership to the JWT student claim. Keys stay in this private orchestration.</summary>
public sealed class ShowService(IDataRepository data, GamificationEngine engine)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static string Path(string id, string action = "") => "show/" + Uri.EscapeDataString(id) + action;
    private static string Language(string? language) => language is null ? "ru" : QuizLocalization.Languages.Contains(language) ? language : throw new DataException(400, "invalidLanguage");
    public Task<JsonNode> CatalogAsync(string studentId, CancellationToken ct, string language = "ru") =>
        data.SendAsync(HttpMethod.Get, "show/catalog?studentId=" + Uri.EscapeDataString(studentId) + "&language=" + Language(language), null, ct);
    public Task<JsonNode> StartAsync(string studentId, ShowStartRequest request, CancellationToken ct) =>
        data.SendAsync(HttpMethod.Post, "show/start", new { studentId, request.CourseId, request.TopicId, request.CharacterId, language = Language(request.Language) }, ct);
    public Task<JsonNode> NextAsync(string studentId, string id, ShowQuestionRequest request, CancellationToken ct) =>
        data.SendAsync(HttpMethod.Post, Path(id, "/next"), new { studentId, request.QuestionIndex, language = Language(request.Language) }, ct);
    public Task<JsonNode> HintAsync(string studentId, string id, ShowQuestionRequest request, CancellationToken ct) =>
        data.SendAsync(HttpMethod.Post, Path(id, "/hint"), new { studentId, request.QuestionIndex, language = Language(request.Language) }, ct);
    public Task<JsonNode> AbandonAsync(string studentId, string id, CancellationToken ct, string language = "ru") =>
        data.SendAsync(HttpMethod.Post, Path(id, "/abandon"), new { studentId, language = Language(language) }, ct);
    public Task<JsonNode> WagerAsync(string studentId, string id, ShowWagerRequest request, CancellationToken ct) =>
        data.SendAsync(HttpMethod.Post, Path(id, "/wager"), new { studentId, request.QuestionIndex, request.Wager, language = Language(request.Language) }, ct);

    public async Task<JsonNode?> ReadAsync(string studentId, string? id, CancellationToken ct, string language = "ru")
    {
        language = Language(language);
        var envelope = await data.SendAsync(HttpMethod.Get,
            (id is null ? "show/active" : Path(id)) + "?studentId=" + Uri.EscapeDataString(studentId) + "&language=" + language, null, ct);
        if (envelope["session"] is null) return null;
        if (envelope["needsTimeout"]?.GetValue<bool>() == true)
        {
            var showId = envelope["session"]!["id"]!.GetValue<string>();
            try
            {
                return await AnswerAsync(studentId, showId,
                    new(envelope["questionIndex"]!.GetValue<int>(), "", envelope["timeoutRequestId"]!.GetValue<string>(), envelope["timeoutWager"]?.GetValue<int>() ?? 0, language), ct);
            }
            catch (DataException ex) when (ex.Status == 409)
            {
                // Another tab may already have settled the question. Read its committed result.
                envelope = await data.SendAsync(HttpMethod.Get, Path(showId) + "?studentId=" + Uri.EscapeDataString(studentId) + "&language=" + language, null, ct);
            }
        }
        return envelope["session"]?.DeepClone();
    }

    public async Task<JsonNode> AnswerAsync(string studentId, string id, ShowAnswerRequest request, CancellationToken ct)
    {
        var language = Language(request.Language);
        if (request.QuestionIndex is < 0 or > 9 || request.Answer is null || request.Answer.Length > 1000 ||
            !Guid.TryParseExact(request.RequestId, "D", out _) || request.Wager is < 0 or > 300)
            throw new DataException(400, "Invalid answer, question index, request ID or wager.");
        for (var retry = 0; retry < 4; retry++)
        {
            var snapshot = await data.SendAsync(HttpMethod.Post, Path(id, "/snapshot"),
                new { studentId, request.QuestionIndex, request.Answer, request.RequestId, request.Wager, language }, ct);
            if (snapshot["replayed"] is { } replay) return replay.DeepClone();
            var game = snapshot["gameSnapshot"]!.Deserialize<GameSnapshot>(Json)
                ?? throw new InvalidOperationException("Invalid show game state.");
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Asia/Qyzylorda"));
            var plan = engine.Evaluate(game, snapshot["canonicalAnswer"]!.GetValue<string>(),
                snapshot["taskSessionId"]!.GetValue<string>(), request.RequestId, today);
            try
            {
                return await data.SendAsync(HttpMethod.Post, Path(id, "/commit"), new
                {
                    studentId, request.QuestionIndex, request.Answer, request.RequestId,
                    wager = snapshot["wager"]!.GetValue<int>(),
                    showVersion = snapshot["showVersion"]!.GetValue<int>(),
                    receivedAt = snapshot["receivedAt"]!.GetValue<string>(), plan, language
                }, ct);
            }
            catch (DataException ex) when (ex.Status == 409 && retry < 3) { }
        }
        throw new DataException(409, "Progress changed; please retry the answer.");
    }
}

public record ShowStartRequest(string CourseId, string CharacterId, string? TopicId = null, string Language = "ru");
public record ShowQuestionRequest(int QuestionIndex, string Language = "ru");
public record ShowWagerRequest(int QuestionIndex, int Wager, string Language = "ru");
public record ShowAnswerRequest(int QuestionIndex, string Answer, string RequestId, int Wager = 0, string Language = "ru");
public record ShowLanguageRequest(string Language = "ru");
