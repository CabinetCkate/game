using System.Text.Json.Nodes;
using System.Text;
using System.Text.RegularExpressions;

namespace GamifiedLearningSystem.Domain;

public static class GroundedQuiz
{
    // Formatting differences do not change a fact. Do not remove words or accept paraphrases.
    private static string Normalize(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormC), @"\s+", " ").Trim().ToUpperInvariant();

    public static string ValidationFeedback(JsonNode generated, string source)
    {
        var issues = new List<string>();
        if (generated["questions"] is not JsonArray items) return "questions must be an array";
        for (var i = 0; i < items.Count; i++) {
            var item = items[i];
            var evidence = item?["evidence"]?.ToString() ?? "";
            var answer = item?["correctAnswer"]?.ToString() ?? "";
            if (evidence.Length == 0 || !Normalize(source).Contains(Normalize(evidence), StringComparison.Ordinal)) issues.Add($"question {i + 1}: evidence is not a contiguous quote from sourceText");
            if (answer.Length == 0 || !Normalize(evidence).Contains(Normalize(answer), StringComparison.Ordinal)) issues.Add($"question {i + 1}: correctAnswer must be copied from its evidence, without paraphrasing or changing word endings");
        }
        return issues.Count > 0 ? string.Join("; ", issues) : "Check question lengths, distinct questions, four distinct options and exactly one option matching correctAnswer";
    }
    // Evidence and keys remain server-side; only QuizQuestionView reaches browsers.
    public static List<QuizQuestion> Parse(JsonNode generated, string title, string source, int count)
    {
        try
        {
            if (generated["questions"] is not JsonArray items || items.Count != count) throw new GameRuleException("insufficientSourceFacts");
            var questions = new List<QuizQuestion>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in items)
            {
                var question = item?["question"]?.GetValue<string>()?.Trim();
                var answer = item?["correctAnswer"]?.GetValue<string>()?.Trim();
                var evidence = item?["evidence"]?.GetValue<string>();
                var options = (item?["options"] as JsonArray)?.Select(o => o?.GetValue<string>()?.Trim() ?? "").ToList();
                if (question is not { Length: > 5 and <= 1500 } || !seen.Add(question) || answer is not { Length: > 0 and <= 500 }
                    || evidence is not { Length: > 0 and <= 4000 } || !Normalize(source).Contains(Normalize(evidence), StringComparison.Ordinal)
                    || !Normalize(evidence).Contains(Normalize(answer), StringComparison.Ordinal) || options is null || options.Count != 4
                    || options.Any(o => o.Length is < 1 or > 500) || options.Select(Normalize).Distinct(StringComparer.Ordinal).Count() != 4
                    || options.Count(o => Normalize(o) == Normalize(answer)) != 1) throw new GameRuleException("invalidGeneratedQuiz");
                answer = options.Single(o => Normalize(o) == Normalize(answer));
                var id = Guid.NewGuid().ToString("N");
                questions.Add(new(id, title, question, answer, options.Select((text, i) => new QuizOption(id + "-" + i, text)).ToList()));
            }
            return questions;
        }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException or NullReferenceException)
        { throw new GameRuleException("invalidGeneratedQuiz"); }
    }
}
