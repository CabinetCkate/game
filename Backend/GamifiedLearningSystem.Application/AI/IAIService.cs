using System.Text.Json.Nodes;
using GamifiedLearningSystem.Domain;
namespace GamifiedLearningSystem.Application.AI;
public interface IAIService
{
    Task<JsonNode> GetNextTaskAsync(string studentId, CancellationToken ct);
    Task<JsonNode> GenerateHintAsync(string studentId, string taskId, CancellationToken ct);
    Task<JsonNode> AnalyzeStudentProgressAsync(string studentId, CancellationToken ct);
    Task<JsonNode> GenerateTaskAsync(JsonNode specification, CancellationToken ct);
    Task<JsonNode> GenerateQuizAsync(string title, string sourceText, int count, CancellationToken ct);
    Task<QuizTranslation> TranslateQuizAsync(string title, List<QuizQuestionView> questions, string language, CancellationToken ct);
}
