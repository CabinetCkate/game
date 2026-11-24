using System.Security.Cryptography;
using System.Text;

namespace GamifiedLearningSystem.Domain;

public sealed class GameRuleException(string code) : Exception(code);
public record QuizOption(string Id, string Text);
public record QuizQuestion(string Id, string Title, string Question, string CorrectAnswer, List<QuizOption> Options);
public record QuizPlayerView(string Id, string Name, int Score, bool Connected, bool Answered, string AvatarId, int Seat, bool? IsCorrect, string AvatarUrl = "", bool IsBot = false);
public record QuizQuestionView(string Id, string Title, string Question, List<QuizOption> Options);
public record QuizRoomView(string Code, long Revision, string HostId, string CourseTitle, string Status, int RoundIndex, int QuestionCount,
    int RoundSeconds, DateTimeOffset ServerNow, DateTimeOffset? Deadline, List<QuizPlayerView> Players,
    QuizQuestionView? Question, string? OwnAnswerId, bool? OwnCorrect, DateTimeOffset? AnswerOpensAt, string Language, string? CorrectOptionId, int? OwnPoints = null, bool IsSolo = false,
    bool IsAudience = false, int AudienceCount = 0, int AudienceScore = 0, string? OwnAudienceVoteId = null, bool? AudienceCorrect = null,
    string? AudienceAnswerId = null, Dictionary<string, int>? AudienceVoteCounts = null, string InviteToken = "");

// All mutation and snapshots are serialized by MultiplayerService. Answers never enter a public DTO.
public sealed class MultiplayerRoom(string code, string hostId, string courseTitle, List<QuizQuestion> questions, int roundSeconds, DateTimeOffset now, int presentationSeconds = 0, string language = "en", bool prepareLanguagesBeforeStart = false, string inviteToken = "")
{
    public sealed class Player(string id, string name)
    {
        public string Id { get; } = id;
        public string Name { get; } = name;
        public int Score { get; set; }
        public string AvatarId { get; set; } = "nova";
        public string AvatarUrl { get; set; } = "";
        public bool IsBot { get; set; }
        public int Seat { get; set; }
        public string Language { get; set; } = "en";
        public HashSet<string> Connections { get; } = [];
        public DateTimeOffset? DisconnectedAt { get; set; }
    }
    private record Answer(string OptionId, bool Correct, int Points);
    private readonly Dictionary<string, Answer> answers = [];
    private readonly Dictionary<string, (DateTimeOffset At, string Option)> botAnswers = [];
    private readonly Dictionary<string, (DateTimeOffset At, string Option)> audienceVotes = [];
    private string? audienceAnswerId;
    private bool? audienceCorrect;
    public int AudienceScore { get; private set; }
    public bool IsSolo { get; private set; }
    private readonly List<QuizQuestion> questions = questions;
    private readonly Dictionary<string, QuizTranslation> translations = new() { [language] = new(courseTitle, questions.Select(q => new QuizQuestionView(q.Id, q.Title, q.Question, q.Options)).ToList()) };
    public List<QuizQuestionView> OriginalQuestions => questions.Select(q => new QuizQuestionView(q.Id, q.Title, q.Question, q.Options.ToList())).ToList();
    public string OriginalTitle { get; } = courseTitle;
    public bool PrepareLanguagesBeforeStart { get; } = prepareLanguagesBeforeStart;
    public bool HasLanguage(string locale) => translations.ContainsKey(locale);
    public void AddTranslation(string locale, QuizTranslation translation) => translations[locale] = translation;
    public void SetLanguage(string id, string locale, DateTimeOffset time)
    {
        if (!TryGetMember(id, out var player, out _)) throw new GameRuleException("notInRoom");
        if (!HasLanguage(locale)) throw new GameRuleException("translationFailed");
        player.Language = locale; UpdatedAt = time; Revision++;
    }
    public string Code { get; } = code;
    public string InviteToken { get; } = inviteToken;
    public bool HasValidInvite(string? token) => token is not null && token.Length == InviteToken.Length && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes(InviteToken));
    public long Revision { get; private set; }
    public string HostId { get; private set; } = hostId;
    public string Status { get; private set; } = "lobby";
    public int RoundIndex { get; private set; } = -1;
    public int RoundSeconds { get; } = roundSeconds;
    public DateTimeOffset? Deadline { get; private set; }
    public DateTimeOffset? AnswerOpensAt { get; private set; }
    public DateTimeOffset CreatedAt { get; } = now;
    public DateTimeOffset UpdatedAt { get; private set; } = now;
    public Dictionary<string, Player> Players { get; } = [];
    public Dictionary<string, Player> Audience { get; } = [];
    public bool ContainsMember(string id) => Players.ContainsKey(id) || Audience.ContainsKey(id);
    private bool TryGetMember(string id, out Player player, out bool isAudience)
    {
        if (Players.TryGetValue(id, out player!)) { isAudience = false; return true; }
        if (Audience.TryGetValue(id, out player!)) { isAudience = true; return true; }
        isAudience = false; return false;
    }
    public void SetAvatarUrl(string id, string url)
    {
        if (Players.TryGetValue(id, out var player)) player.AvatarUrl = url;
    }

    public void Join(string id, string name, string connection, DateTimeOffset time, string? avatarId = null)
    {
        if (!TryGetMember(id, out var player, out var isAudience))
        {
            if (Status == "lobby" && Players.Count < 4)
            {
                var seat = Enumerable.Range(0, 4).First(index => Players.Values.All(player => player.Seat != index));
                player = new(id, name) { Seat = seat, Language = language, AvatarId = new[] { "nova", "leo", "maya", "atlas" }[seat % 4] }; Players.Add(id, player);
            }
            else
            {
                player = new(id, name) { Seat = -1, Language = language };
                Audience.Add(id, player); isAudience = true;
            }
        }
        if (!isAudience && Status == "lobby" && avatarId is ("nova" or "leo" or "maya" or "atlas")) player.AvatarId = avatarId;
        player.Connections.Add(connection); player.DisconnectedAt = null; UpdatedAt = time; Revision++;
    }
    public void AddBots(DateTimeOffset time)
    {
        IsSolo = true;
        var available = new[] { ("nova", "Нова"), ("leo", "Лео"), ("maya", "Майя"), ("atlas", "Атлас") }.Where(c => c.Item1 != Players[HostId].AvatarId).ToList();
        foreach (var (avatar, name) in available)
        {
            var id = "bot-" + avatar;
            var bot = new Player(id, name) { AvatarId = avatar, IsBot = true, Seat = Players.Count, Language = language };
            bot.Connections.Add(id); Players.Add(id, bot);
        }
        UpdatedAt = time; Revision++;
    }
    public void Disconnect(string connection, DateTimeOffset time)
    {
        foreach (var player in Players.Values.Concat(Audience.Values).Where(p => p.Connections.Remove(connection)))
            if (player.Connections.Count == 0) player.DisconnectedAt = time;
        Revision++;
    }
    public void Leave(string id, DateTimeOffset time) { Players.Remove(id); Audience.Remove(id); audienceVotes.Remove(id); UpdatedAt = time; Revision++; }
    public void SelectCharacter(string id, string avatarId, DateTimeOffset time)
    {
        if (!Players.TryGetValue(id, out var player)) throw new GameRuleException("notInRoom");
        if (Status != "lobby") throw new GameRuleException("gameStarted");
        if (avatarId is not ("nova" or "leo" or "maya" or "atlas")) throw new GameRuleException("invalidCharacter");
        player.AvatarId = avatarId; UpdatedAt = time; Revision++;
    }
    public void Start(string id, DateTimeOffset time)
    {
        RequireHost(id);
        if (Status != "lobby") throw new GameRuleException("gameStarted");
        if (Players.Values.Count(p => p.Connections.Count > 0) < 2) throw new GameRuleException("needPlayers");
        Next(time);
    }
    public void NextRound(string id, DateTimeOffset time)
    {
        RequireHost(id);
        if (Status != "results") throw new GameRuleException("roundActive");
        Next(time);
    }
    private void RequireHost(string id) { if (HostId != id) throw new GameRuleException("hostOnly"); }
    private void Next(DateTimeOffset time)
    {
        RoundIndex++; answers.Clear(); audienceVotes.Clear(); audienceAnswerId = null; audienceCorrect = null; UpdatedAt = time; Revision++;
        botAnswers.Clear();
        Status = RoundIndex >= questions.Count ? "finished" : presentationSeconds > 0 ? "preview" : "question";
        AnswerOpensAt = Status == "finished" ? null : time.AddSeconds(presentationSeconds);
        Deadline = Status == "finished" ? null : time.AddSeconds(presentationSeconds + RoundSeconds);
        if (Status != "finished") foreach (var bot in Players.Values.Where(p => p.IsBot))
        {
            var q = questions[RoundIndex];
            var correct = Random.Shared.NextDouble() < .65;
            var options = q.Options.Where(o => string.Equals(o.Text.Trim(), q.CorrectAnswer.Trim(), StringComparison.OrdinalIgnoreCase) == correct).ToList();
            botAnswers[bot.Id] = (AnswerOpensAt!.Value.AddSeconds(RoundSeconds * (.2 + Random.Shared.NextDouble() * .6)), options[Random.Shared.Next(options.Count)].Id);
        }
    }
    public void Submit(string id, string questionId, string optionId, DateTimeOffset time)
    {
        if (!TryGetMember(id, out _, out var isAudience)) throw new GameRuleException("notInRoom");
        if (Status != "question" || time >= Deadline) throw new GameRuleException("roundClosed");
        var question = questions[RoundIndex];
        if (question.Id != questionId) throw new GameRuleException("roundClosed");
        var option = question.Options.Find(o => o.Id == optionId) ?? throw new GameRuleException("invalidAnswer");
        if (isAudience)
        {
            audienceVotes[id] = (time, option.Id);
            UpdatedAt = time; Revision++;
            return;
        }
        if (answers.TryGetValue(id, out var previous) && previous.OptionId == optionId) return;
        var correct = string.Equals(option.Text.Trim(), question.CorrectAnswer.Trim(), StringComparison.OrdinalIgnoreCase);
        // The latest selection replaces the previous one until the deadline.
        // Keep correctness and points private while players can still change their answers.
        // Even a changed public score would disclose the answer to students who are still choosing.
        answers[id] = new(option.Id, correct, correct ? 1000 + (int)Math.Clamp((Deadline!.Value - time).TotalSeconds / RoundSeconds * 500, 0, 500) : 0);
        UpdatedAt = time; Revision++;
    }
    public void ConfirmSoloAnswer(string id, string questionId, string optionId, DateTimeOffset time)
    {
        RequireHost(id);
        if (!IsSolo) throw new GameRuleException("invalidRoomSettings");
        Submit(id, questionId, optionId, time);
        // Bots already have server-generated choices and response times. Resolve those
        // choices now so the human never has to wait for their animation/timer.
        foreach (var (botId, planned) in botAnswers)
            if (!answers.ContainsKey(botId)) Submit(botId, questionId, planned.Option, planned.At);
        EndRound(time);
    }
    private void EndRound(DateTimeOffset time)
    {
        foreach (var player in Players.Values) if (answers.TryGetValue(player.Id, out var answer)) player.Score += answer.Points;
        var question = questions[RoundIndex];
        var winningVote = audienceVotes.Values.GroupBy(vote => vote.Option).OrderByDescending(group => group.Count())
            .ThenBy(group => group.Min(vote => vote.At)).ThenBy(group => group.Key, StringComparer.Ordinal).FirstOrDefault();
        if (winningVote is not null)
        {
            audienceAnswerId = winningVote.Key;
            audienceCorrect = string.Equals(question.Options.Single(option => option.Id == audienceAnswerId).Text.Trim(), question.CorrectAnswer.Trim(), StringComparison.OrdinalIgnoreCase);
            if (audienceCorrect.Value) AudienceScore += 1000;
        }
        Status = "results"; Deadline = time.AddSeconds(6); UpdatedAt = time; Revision++;
    }
    public bool Tick(DateTimeOffset time)
    {
        var changed = false;
        foreach (var id in Players.Values.Concat(Audience.Values).Where(p => p.DisconnectedAt is { } at && time - at > TimeSpan.FromSeconds(90)).Select(p => p.Id).ToList())
        { Players.Remove(id); Audience.Remove(id); audienceVotes.Remove(id); changed = true; }
        if (changed) Revision++;
        if (Status == "preview" && time >= AnswerOpensAt) { Status = "question"; Revision++; changed = true; }
        if (Status == "question") foreach (var bot in botAnswers.Where(b => b.Value.At <= time && !answers.ContainsKey(b.Key)).ToList())
        {
            if (Status != "question" || time >= Deadline) break;
            Submit(bot.Key, questions[RoundIndex].Id, bot.Value.Option, time); changed = true;
        }
        if (Status == "question" && time >= Deadline) { EndRound(time); changed = true; }
        else if (Status == "results" && time >= Deadline) { Next(time); changed = true; }
        return changed;
    }
    public QuizRoomView View(string id, DateTimeOffset time)
    {
        if (!TryGetMember(id, out var member, out var isAudience)) throw new GameRuleException("notInRoom");
        var question = Status is "preview" or "question" or "results" ? questions[RoundIndex] : null;
        answers.TryGetValue(id, out var own);
        audienceVotes.TryGetValue(id, out var ownVote);
        var playerLanguage = member.Language;
        var display = translations[playerLanguage];
        var revealed = Status == "results";
        var voteCounts = revealed ? audienceVotes.Values.GroupBy(vote => vote.Option).ToDictionary(group => group.Key, group => group.Count()) : null;
        var ownVoteCorrect = revealed && ownVote.Option is not null && question is not null
            ? string.Equals(question.Options.Single(option => option.Id == ownVote.Option).Text.Trim(), question.CorrectAnswer.Trim(), StringComparison.OrdinalIgnoreCase)
            : (bool?)null;
        return new(Code, Revision, HostId, display.CourseTitle, Status, RoundIndex, questions.Count, RoundSeconds, time, Deadline,
            Players.Values.OrderByDescending(p => p.Score).ThenBy(p => p.Seat).Select(p => new QuizPlayerView(p.Id, p.Name, p.Score, p.Connections.Count > 0, answers.ContainsKey(p.Id), p.AvatarId, p.Seat, revealed ? answers.GetValueOrDefault(p.Id)?.Correct ?? false : null, p.AvatarUrl, p.IsBot)).ToList(),
            question is null ? null : display.Questions.Single(q => q.Id == question.Id), own?.OptionId, revealed ? (isAudience ? ownVoteCorrect : own?.Correct ?? false) : null, AnswerOpensAt,
            playerLanguage, revealed ? question?.Options.Single(o => string.Equals(o.Text.Trim(), question.CorrectAnswer.Trim(), StringComparison.OrdinalIgnoreCase)).Id : null, revealed ? own?.Points ?? 0 : null, IsSolo,
            isAudience, Audience.Values.Count(p => p.Connections.Count > 0), AudienceScore, ownVote.Option, ownVoteCorrect, audienceAnswerId, voteCounts, Status == "lobby" ? InviteToken : "");
    }
}
