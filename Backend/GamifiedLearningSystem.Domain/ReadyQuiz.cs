using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace GamifiedLearningSystem.Domain;

// Import authored tests without asking an AI to rewrite their questions or answers.
public static class ReadyQuiz
{
    public static List<QuizQuestion> Parse(string source, string title)
    {
        var rows = new List<(int? Number, string Question, List<string> Options, string Answer)>();
        var answerKey = new Dictionary<int, string>();
        if (source.TrimStart().StartsWith('[') || source.TrimStart().StartsWith('{'))
        {
            try
            {
                var node = JsonNode.Parse(source);
                var items = node as JsonArray ?? node?["questions"] as JsonArray ?? throw new GameRuleException("invalidReadyQuiz");
                foreach (var item in items)
                {
                    var options = (item?["options"] as JsonArray)?.Select(o => o is JsonObject ? o["text"]?.ToString() ?? "" : o?.ToString() ?? "").ToList() ?? [];
                    rows.Add((null, item?["question"]?.ToString() ?? "", options, item?["correctAnswer"]?.ToString() ?? ""));
                }
            }
            catch (System.Text.Json.JsonException) { throw new GameRuleException("invalidReadyQuiz"); }
        }
        else
        {
            var heading = Regex.Match(source, @"^\s*(?:Жауаптар\s+кілті|Жауап\s+кілті|Ключ\s+ответов|Ответы|Answer\s+keys?|Answers)\s*[:：]?[^\S\r\n]*(?:\r?\n|(?=\d)|$)", RegexOptions.IgnoreCase | RegexOptions.Multiline);
            if (heading.Success)
            {
                var keys = source[(heading.Index + heading.Length)..];
                var entries = Regex.Matches(keys, @"(?<!\S)(\d+)\s*[—–\-:：.)=]\s*([A-HАБВГДЕЖЗ])(?=$|[\s,;|])", RegexOptions.IgnoreCase);
                foreach (Match entry in entries)
                    if (!int.TryParse(entry.Groups[1].Value, out var number) || !answerKey.TryAdd(number, entry.Groups[2].Value))
                        throw new GameRuleException("invalidReadyQuiz");
                var remainder = Regex.Replace(keys, @"(?<!\S)(\d+)\s*[—–\-:：.)=]\s*([A-HАБВГДЕЖЗ])(?=$|[\s,;|])", "", RegexOptions.IgnoreCase);
                if (answerKey.Count == 0 || remainder.Any(c => !char.IsWhiteSpace(c) && c is not ',' and not ';' and not '|'))
                    throw new GameRuleException("invalidReadyQuiz");
                source = source[..heading.Index];
            }
            var hasNumberedQuestions = Regex.IsMatch(source, @"^\s*\d+\s*[).]\s*\S", RegexOptions.Multiline);
            string question = "", answer = ""; int? questionNumber = null; var options = new List<string>();
            void Flush() { if (question.Length > 0) rows.Add((questionNumber, question, options, answer)); question = ""; answer = ""; questionNumber = null; options = []; }
            foreach (var raw in source.Split('\n'))
            {
                var line = raw.Trim(); if (line.Length == 0) continue;
                var numbered = Regex.Match(line, @"^(\d+)\s*[).]\s*(.+)$");
                // Printed worksheets often start with a title, name/class fields and instructions.
                if (hasNumberedQuestions && rows.Count == 0 && question.Length == 0 && !numbered.Success) continue;
                var key = Regex.Match(line, @"^(?:Answer|Correct answer|Ответ|Правильный ответ|Жауап|Дұрыс жауап)\s*[:：]\s*(.+)$", RegexOptions.IgnoreCase);
                if (key.Success) { answer = key.Groups[1].Value.Trim(); continue; }
                var option = Regex.Match(line, @"^(\*)?\s*([A-HА-Нa-hа-н])\s*[).:]\s*(.+)$");
                if (option.Success) { options.Add(option.Groups[3].Value.Trim()); if (option.Groups[1].Success) answer = options[^1]; continue; }
                if (numbered.Success) {
                    Flush(); question = numbered.Groups[2].Value;
                    if (!int.TryParse(numbered.Groups[1].Value, out var number)) throw new GameRuleException("invalidReadyQuiz");
                    questionNumber = number;
                }
                else if (options.Count == 0) question = question.Length == 0 ? line : question + " " + line;
                else { Flush(); question = line; }
            }
            Flush();
        }
        if (rows.Count is < 1 or > 100) throw new GameRuleException("invalidReadyQuiz");
        var questions = new List<QuizQuestion>();
        foreach (var row in rows)
        {
            string Resolve(string value) {
                var text = value.Trim().TrimEnd('.', ')');
                var index = "ABCDEFGH".IndexOf(text.ToUpperInvariant(), StringComparison.Ordinal);
                if (index < 0) index = "АБВГДЕЖЗ".IndexOf(text.ToUpperInvariant(), StringComparison.Ordinal);
                return text.Length == 1 && index >= 0 && index < row.Options.Count ? row.Options[index] : text;
            }
            var answer = Resolve(row.Answer);
            if (row.Number is { } number && answerKey.Remove(number, out var key)) {
                var keyedAnswer = Resolve(key);
                if (answer.Length > 0 && !string.Equals(answer, keyedAnswer, StringComparison.OrdinalIgnoreCase)) throw new GameRuleException("invalidReadyQuiz");
                answer = keyedAnswer;
            }
            var matches = row.Options.Where(o => string.Equals(o.Trim(), answer, StringComparison.OrdinalIgnoreCase)).ToList();
            if (row.Question.Length is < 3 or > 1500 || row.Options.Count is < 2 or > 8 || row.Options.Any(o => o.Length is < 1 or > 500)
                || row.Options.Distinct(StringComparer.OrdinalIgnoreCase).Count() != row.Options.Count || matches.Count != 1)
                throw new GameRuleException("invalidReadyQuiz");
            var id = Guid.NewGuid().ToString("N");
            questions.Add(new(id, title, row.Question.Trim(), matches[0], row.Options.Select((text, i) => new QuizOption(id + "-" + i, text)).ToList()));
        }
        if (answerKey.Count > 0) throw new GameRuleException("invalidReadyQuiz");
        return questions;
    }
}
