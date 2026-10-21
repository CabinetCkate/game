using System.Text.Json;
using GamifiedLearningSystem.Domain;
using GamifiedLearningSystem.Application.Services;

namespace GamifiedLearningSystem.API.QuizLibrary;

public record SavedQuiz(string Id, string OwnerId, string Title, string SourceText, string SourceKind, string Language, DateTimeOffset CreatedAt, List<QuizQuestion> Questions);
public sealed class QuizLibraryStore(IHostEnvironment environment, IConfiguration config)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly string directory = Path.GetFullPath(config["QuizLibrary:Directory"] ?? Path.Combine(environment.ContentRootPath, "App_Data", "quiz-library"));
    private static readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web);
    private string OwnerDirectory(string owner) => Path.Combine(directory, Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(owner))));
    public async Task<List<SavedQuiz>> List(string owner, CancellationToken ct)
    {
        var path = OwnerDirectory(owner);
        if (!Directory.Exists(path)) return [];
        var result = new List<SavedQuiz>();
        foreach (var file in Directory.EnumerateFiles(path, "*.json"))
        {
            var quiz = JsonSerializer.Deserialize<SavedQuiz>(await File.ReadAllTextAsync(file, ct), json);
            if (quiz?.OwnerId == owner) result.Add(quiz);
        }
        return result.OrderByDescending(q => q.CreatedAt).ToList();
    }
    public async Task<SavedQuiz> Get(string owner, string id, CancellationToken ct)
    {
        if (!Guid.TryParseExact(id, "N", out var key)) throw new DataException(404, "Quiz not found.");
        var path = Path.Combine(OwnerDirectory(owner), key.ToString("N") + ".json");
        if (!File.Exists(path)) throw new DataException(404, "Quiz not found.");
        var quiz = JsonSerializer.Deserialize<SavedQuiz>(await File.ReadAllTextAsync(path, ct), json);
        return quiz?.OwnerId == owner ? quiz : throw new DataException(404, "Quiz not found.");
    }
    public async Task<SavedQuiz> Save(string owner, string title, string source, string kind, string language, List<QuizQuestion> questions, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        try
        {
            var path = OwnerDirectory(owner); Directory.CreateDirectory(path);
            if (Directory.EnumerateFiles(path, "*.json").Count() >= 200) throw new DataException(400, "Your library contains 200 topics.");
            var quiz = new SavedQuiz(Guid.NewGuid().ToString("N"), owner, title, source, kind, language, DateTimeOffset.UtcNow, questions);
            var target = Path.Combine(path, quiz.Id + ".json"); var temporary = target + ".tmp";
            try { await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(quiz, json), ct); File.Move(temporary, target); }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
            return quiz;
        }
        finally { gate.Release(); }
    }
}
