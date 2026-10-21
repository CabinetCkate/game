using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace GamifiedLearningSystem.Domain;

public record QuizTranslation(string CourseTitle, List<QuizQuestionView> Questions);

public static class QuizLocalization
{
    public static readonly string[] Languages = ["en", "ru", "kk"];
    public static string RequireLanguage(string language) => Languages.Contains(language) ? language : throw new GameRuleException("invalidLanguage");
    public static string DetectLanguage(IEnumerable<QuizQuestionView> questions)
    {
        var text = string.Join(" ", questions.Select(q => q.Question));
        return Regex.IsMatch(text, "[ӘәҒғҚқҢңӨөҰұҮүҺһІі]") ? "kk" : Regex.IsMatch(text, "[А-Яа-яЁё]") ? "ru" : "en";
    }

    // Persist a translated generated quiz without changing which option is correct.
    public static List<QuizQuestion> ApplyToCanonical(List<QuizQuestion> original, QuizTranslation display)
    {
        return original.Select(question => {
            var correctId = question.Options.Single(o => string.Equals(o.Text.Trim(), question.CorrectAnswer.Trim(), StringComparison.OrdinalIgnoreCase)).Id;
            var translated = display.Questions.Single(q => q.Id == question.Id);
            return new QuizQuestion(question.Id, translated.Title, translated.Question,
                translated.Options.Single(o => o.Id == correctId).Text, translated.Options);
        }).ToList();
    }

    // Only display strings can change. Question/option IDs still bind to the canonical server-owned quiz.
    // Translation requests and responses never contain a correct answer or evidence.
    public static QuizTranslation Parse(JsonNode translated, List<QuizQuestionView> original)
    {
        try
        {
            var title = translated["courseTitle"]?.GetValue<string>()?.Trim();
            if (title is not { Length: > 0 and <= 200 } || translated["questions"] is not JsonArray items || items.Count != original.Count)
                throw new GameRuleException("translationFailed");
            var questions = new List<QuizQuestionView>();
            foreach (var source in original)
            {
                var matches = items.Where(q => q?["id"]?.GetValue<string>() == source.Id).ToList();
                if (matches.Count != 1) throw new GameRuleException("translationFailed");
                var question = matches[0]!;
                var questionTitle = question["title"]?.GetValue<string>()?.Trim();
                var text = question["question"]?.GetValue<string>()?.Trim();
                if (questionTitle is not { Length: > 0 and <= 200 } || text is not { Length: > 5 and <= 1500 }
                    || question["options"] is not JsonArray optionItems || optionItems.Count != source.Options.Count)
                    throw new GameRuleException("translationFailed");
                var options = new List<QuizOption>();
                foreach (var option in source.Options)
                {
                    var optionMatches = optionItems.Where(o => o?["id"]?.GetValue<string>() == option.Id).ToList();
                    if (optionMatches.Count != 1 || optionMatches[0]?["text"]?.GetValue<string>()?.Trim() is not { Length: > 0 and <= 500 } optionText)
                        throw new GameRuleException("translationFailed");
                    options.Add(new(option.Id, optionText));
                }
                if (options.Select(o => Regex.Replace(o.Text, @"\s+", " ")).Distinct(StringComparer.OrdinalIgnoreCase).Count() != options.Count)
                    throw new GameRuleException("translationFailed");
                questions.Add(new(source.Id, questionTitle, text, options));
            }
            return new(title, questions);
        }
        catch (Exception ex) when (ex is InvalidOperationException or ArgumentException or NullReferenceException)
        { throw new GameRuleException("translationFailed"); }
    }
}
