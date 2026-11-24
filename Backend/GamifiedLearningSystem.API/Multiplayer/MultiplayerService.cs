using System.Security.Cryptography;
using System.Text.Json;
using GamifiedLearningSystem.Application.Interfaces;
using GamifiedLearningSystem.Application.AI;
using GamifiedLearningSystem.Domain;
using Microsoft.AspNetCore.SignalR;

namespace GamifiedLearningSystem.API.Multiplayer;

public sealed class MultiplayerService(IServiceScopeFactory scopes, IHubContext<GameHub> hub, ILogger<MultiplayerService> logger) : BackgroundService
{
    private readonly object gate = new();
    private readonly Dictionary<string, MultiplayerRoom> rooms = [];
    private readonly Dictionary<string, DateTimeOffset> generating = [];
    private readonly Dictionary<(string Room, string Language), Task<QuizTranslation>> translating = [];
    private static readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web);
    private static string Normalize(string code) => (code ?? "").Trim().ToUpperInvariant();
    private MultiplayerRoom Find(string code) => rooms.GetValueOrDefault(Normalize(code)) ?? throw new GameRuleException("roomNotFound");
    private async Task<(string Name, string Photo)> Profile(string id)
    {
        using var scope = scopes.CreateScope();
        var student = await scope.ServiceProvider.GetRequiredService<IDataRepository>().SendAsync(HttpMethod.Get, "students/me?studentId=" + Uri.EscapeDataString(id), null, CancellationToken.None);
        var photo = student["avatarUrl"]?.ToString() ?? "";
        return (($"{student["firstName"]} {student["lastName"]}").Trim(), photo.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? photo : "");
    }
    public async Task<QuizRoomView> Create(string id, string connection, string courseId, int count, int seconds, string? avatarId = null, int presentationSeconds = 0, string? language = null)
    {
        var localized = language is not null;
        if (language is not null) QuizLocalization.RequireLanguage(language);
        if (count is < 1 or > 20 || seconds is < 10 or > 120 || string.IsNullOrWhiteSpace(courseId) || courseId.Length > 100) throw new GameRuleException("invalidRoomSettings");
        using var scope = scopes.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IDataRepository>();
        var access = await repository.SendAsync(HttpMethod.Get, "courses/" + Uri.EscapeDataString(courseId) + "?studentId=" + Uri.EscapeDataString(id), null, CancellationToken.None);
        if (access["enrolled"]?.GetValue<bool>() != true) throw new GameRuleException("courseNotPurchased");
        var data = await repository.SendAsync(HttpMethod.Get, "multiplayer/questions?courseId=" + Uri.EscapeDataString(courseId), null, CancellationToken.None);
        var questions = data["questions"]?.Deserialize<List<QuizQuestion>>(json) ?? [];
        questions = questions.Where(q => q.Options.Count >= 2 && q.Options.Any(o => string.Equals(o.Text.Trim(), q.CorrectAnswer.Trim(), StringComparison.OrdinalIgnoreCase)))
            .OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).Take(count).ToList();
        if (questions.Count == 0) throw new GameRuleException("noQuestions");
        foreach (var q in questions) q.Options.Sort((a, b) => string.CompareOrdinal(a.Id, b.Id));
        var originalViews = questions.Select(q => new QuizQuestionView(q.Id, q.Title, q.Question, q.Options)).ToList();
        var originalLanguage = QuizLocalization.DetectLanguage(originalViews);
        var prepared = new Dictionary<string, QuizTranslation>();
        // Prepared subject banks carry all three display languages; answer keys stay canonical.
        foreach (var locale in QuizLocalization.Languages)
        {
            var localizedQuestions = new System.Text.Json.Nodes.JsonArray();
            foreach (var question in questions)
            {
                var entry = data["questions"]?.AsArray().FirstOrDefault(q => q?["id"]?.GetValue<string>() == question.Id)?["translations"]?[locale];
                if (entry is null) break;
                var display = entry.DeepClone(); display["id"] = question.Id; localizedQuestions.Add(display);
            }
            if (localizedQuestions.Count == questions.Count)
            {
                var localizedDisplay = new System.Text.Json.Nodes.JsonObject { ["courseTitle"] = data["courseTitles"]?[locale]?.ToString() ?? data["courseTitle"]?.ToString() ?? courseId, ["questions"] = localizedQuestions };
                prepared[locale] = QuizLocalization.Parse(localizedDisplay, originalViews);
            }
        }
        language ??= originalLanguage;
        if (language != originalLanguage && !prepared.ContainsKey(language)) prepared[language] = await TranslateOrOriginal(data["courseTitle"]?.ToString() ?? courseId, originalViews, language, CancellationToken.None);
        var profile = await Profile(id);
        return await Store(id, connection, profile.Name, data["courseTitle"]?.ToString() ?? courseId, questions, seconds, avatarId, presentationSeconds, originalLanguage, language, prepared, localized, profile.Photo);
    }
    public async Task<QuizRoomView> CreateText(string id, string connection, string title, string sourceText, int count, int seconds, string avatarId, CancellationToken ct, string? language = null)
    {
        var localized = language is not null;
        if (language is not null) QuizLocalization.RequireLanguage(language);
        title = (title ?? "").Trim(); sourceText = (sourceText ?? "").Trim();
        if (title.Length is < 1 or > 100 || sourceText.Length is < 80 or > 20000 || count is < 1 or > 20 || seconds is < 10 or > 120) throw new GameRuleException("invalidSourceSettings");
        lock (gate)
        {
            if (rooms.Count >= 500) throw new GameRuleException("serverBusy");
            if (generating.TryGetValue(id, out var previous) && DateTimeOffset.UtcNow - previous < TimeSpan.FromSeconds(30)) throw new GameRuleException("generationBusy");
            generating[id] = DateTimeOffset.UtcNow;
        }
        using var scope = scopes.CreateScope();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(90));
        try
        {
            var generated = await scope.ServiceProvider.GetRequiredService<IAIService>().GenerateQuizAsync(title, sourceText, count, timeout.Token);
            var questions = GroundedQuiz.Parse(generated, title, sourceText, count);
            // Shuffle once on the server, so all participants receive identical choices.
            questions = questions.Select(q => q with { Options = q.Options.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).ToList() }).ToList();
            var originalViews = questions.Select(q => new QuizQuestionView(q.Id, q.Title, q.Question, q.Options)).ToList();
            var originalLanguage = QuizLocalization.DetectLanguage(originalViews);
            language ??= originalLanguage;
            var prepared = new Dictionary<string, QuizTranslation>();
            if (language != originalLanguage) prepared[language] = await TranslateOrOriginal(title, originalViews, language, timeout.Token);
            var profile = await Profile(id);
            ct.ThrowIfCancellationRequested();
            await scope.ServiceProvider.GetRequiredService<GamifiedLearningSystem.API.QuizLibrary.QuizLibraryStore>().Save(id, title, sourceText, "text", language, questions, ct);
            return await Store(id, connection, profile.Name, title, questions, seconds, avatarId, 5, originalLanguage, language, prepared, localized, profile.Photo);
        }
        catch (GamifiedLearningSystem.Application.Services.DataException ex) when (ex.Message == "aiUnavailable") { throw new GameRuleException("aiUnavailable"); }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException)
        { logger.LogWarning("Source quiz generation unavailable: {Type}", ex.GetType().Name); throw new GameRuleException("generationFailed"); }
    }
    private async Task<QuizRoomView> Store(string id, string connection, string name, string title, List<QuizQuestion> questions, int seconds, string? avatarId, int presentationSeconds,
        string originalLanguage, string language, Dictionary<string, QuizTranslation> prepared, bool localized, string photo = "", bool bots = false)
    {
        List<string> leftRooms;
        QuizRoomView view;
        lock (gate)
        {
            if (rooms.Count >= 500) throw new GameRuleException("serverBusy");
            var previousRooms = rooms.Values.Where(r => r.ContainsMember(id)).ToList();
            leftRooms = [];
            foreach (var previous in previousRooms)
            {
                previous.Leave(id, DateTimeOffset.UtcNow);
                if ((previous.IsSolo && previous.HostId == id) || previous.Players.Count == 0) rooms.Remove(previous.Code);
                else leftRooms.Add(previous.Code);
            }
            string code;
            do { code = string.Concat(Enumerable.Range(0, 6).Select(_ => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[RandomNumberGenerator.GetInt32(32)])); } while (rooms.ContainsKey(code));
            var inviteToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
            var room = new MultiplayerRoom(code, id, title, questions, seconds, DateTimeOffset.UtcNow, presentationSeconds, originalLanguage, localized, inviteToken);
            foreach (var (locale, display) in prepared) room.AddTranslation(locale, display);
            room.Join(id, name, connection, DateTimeOffset.UtcNow, avatarId); rooms.Add(code, room);
            room.SetAvatarUrl(id, photo);
            if (bots) room.AddBots(DateTimeOffset.UtcNow);
            room.SetLanguage(id, language, DateTimeOffset.UtcNow);
            view = room.View(id, DateTimeOffset.UtcNow);
        }
        foreach (var previousCode in leftRooms) await Broadcast(previousCode);
        return view;
    }
    public async Task<QuizRoomView> CreateSaved(string id, string connection, string quizId, int seconds, string avatarId, bool bots, string language, CancellationToken ct)
    {
        QuizLocalization.RequireLanguage(language);
        if (seconds is < 10 or > 120) throw new GameRuleException("invalidRoomSettings");
        using var scope = scopes.CreateScope();
        var quiz = await scope.ServiceProvider.GetRequiredService<GamifiedLearningSystem.API.QuizLibrary.QuizLibraryStore>().Get(id, quizId, ct);
        var profile = await Profile(id);
        var questions = quiz.Questions.Select(q => q with { Options = q.Options.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).ToList() }).ToList();
        // Language metadata from older saves may describe the UI, not the actual text.
        // Keep canonical answers intact and translate only display strings by stable IDs.
        var views = questions.Select(q => new QuizQuestionView(q.Id, q.Title, q.Question, q.Options)).ToList();
        var originalLanguage = QuizLocalization.DetectLanguage(views);
        var prepared = new Dictionary<string, QuizTranslation>();
        if (language != originalLanguage) prepared[language] = await TranslateOrOriginal(quiz.Title, views, language, ct);
        var view = await Store(id, connection, profile.Name, quiz.Title, questions, seconds, avatarId, 5, originalLanguage, language,
            prepared, false, profile.Photo, bots);
        if (!bots) return view;
        await Start(id, view.Code);
        lock (gate) return Find(view.Code).View(id, DateTimeOffset.UtcNow);
    }
    public async Task<QuizRoomView> Join(string id, string connection, string code, string? avatarId = null, string? language = null, string? inviteToken = null)
    {
        MultiplayerRoom room;
        lock (gate)
        {
            room = Find(code);
            if (!room.ContainsMember(id) && (room.Status != "lobby" || room.Players.Count >= 4))
            {
                if (room.IsSolo) throw new GameRuleException("spectatorsOnlineOnly");
                if (!room.HasValidInvite(inviteToken)) throw new GameRuleException("inviteOnly");
            }
        }
        if (language is not null) { QuizLocalization.RequireLanguage(language); await EnsureLanguage(room, language); }
        var profile = await Profile(id);
        List<string> leftRooms;
        QuizRoomView view;
        lock (gate)
        {
            room = Find(code);
            if (!room.ContainsMember(id) && (room.Status != "lobby" || room.Players.Count >= 4))
            {
                if (room.IsSolo) throw new GameRuleException("spectatorsOnlineOnly");
                if (!room.HasValidInvite(inviteToken)) throw new GameRuleException("inviteOnly");
            }
            var previousRooms = rooms.Values.Where(r => r.Code != room.Code && r.ContainsMember(id)).ToList();
            leftRooms = [];
            foreach (var previous in previousRooms)
            {
                previous.Leave(id, DateTimeOffset.UtcNow);
                if ((previous.IsSolo && previous.HostId == id) || previous.Players.Count == 0) rooms.Remove(previous.Code);
                else leftRooms.Add(previous.Code);
            }
            room.Join(id, profile.Name, connection, DateTimeOffset.UtcNow, avatarId);
            room.SetAvatarUrl(id, profile.Photo);
            if (language is not null) room.SetLanguage(id, language, DateTimeOffset.UtcNow);
            view = room.View(id, DateTimeOffset.UtcNow);
        }
        foreach (var previousCode in leftRooms) await Broadcast(previousCode);
        return view;
    }
    private async Task<QuizTranslation> Translate(string title, List<QuizQuestionView> questions, string language, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(90));
        try { return await scope.ServiceProvider.GetRequiredService<IAIService>().TranslateQuizAsync(title, questions, language, timeout.Token); }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or OperationCanceledException or InvalidOperationException)
        { logger.LogWarning("Quiz translation unavailable: {Type}", ex.GetType().Name); throw new GameRuleException("translationFailed"); }
    }
    private async Task<QuizTranslation> TranslateOrOriginal(string title, List<QuizQuestionView> questions, string language, CancellationToken ct)
    {
        try { return await Translate(title, questions, language, ct); }
        catch (GameRuleException ex) when (ex.Message == "translationFailed")
        {
            logger.LogWarning("Quiz translation to {Language} is unavailable; keeping the original text", language);
            return new(title, questions.Select(q => q with { Options = q.Options.ToList() }).ToList());
        }
        catch (GamifiedLearningSystem.Application.Services.DataException ex) when (ex.Message == "aiUnavailable")
        {
            logger.LogWarning("Quiz translation to {Language} is unavailable; keeping the original text", language);
            return new(title, questions.Select(q => q with { Options = q.Options.ToList() }).ToList());
        }
    }
    private async Task EnsureLanguage(MultiplayerRoom room, string language)
    {
        Task<QuizTranslation> pending;
        var key = (room.Code, language);
        lock (gate)
        {
            if (room.HasLanguage(language)) return;
            if (!translating.TryGetValue(key, out pending!))
            {
                var title = room.OriginalTitle; var questions = room.OriginalQuestions;
                pending = Task.Run(() => TranslateOrOriginal(title, questions, language, CancellationToken.None));
                translating[key] = pending;
            }
        }
        try
        {
            var translated = await pending;
            lock (gate) room.AddTranslation(language, translated);
        }
        finally { lock (gate) if (translating.GetValueOrDefault(key) == pending) translating.Remove(key); }
    }
    public async Task<QuizRoomView> SetLanguage(string id, string code, string language)
    {
        QuizLocalization.RequireLanguage(language);
        MultiplayerRoom room;
        lock (gate) { room = Find(code); if (!room.ContainsMember(id)) throw new GameRuleException("notInRoom"); }
        await EnsureLanguage(room, language);
        lock (gate) { room = Find(code); room.SetLanguage(id, language, DateTimeOffset.UtcNow); return room.View(id, DateTimeOffset.UtcNow); }
    }
    public async Task Start(string id, string code)
    {
        MultiplayerRoom room;
        lock (gate)
        {
            room = Find(code);
            if (room.HostId != id) throw new GameRuleException("hostOnly");
            if (room.Status != "lobby") throw new GameRuleException("gameStarted");
            if (room.Players.Values.Count(p => p.Connections.Count > 0) < 2) throw new GameRuleException("needPlayers");
        }
        // Prepare before starting the shared clock. Changing the language during a match then has no AI latency.
        if (room.PrepareLanguagesBeforeStart) await Task.WhenAll(QuizLocalization.Languages.Select(locale => EnsureLanguage(room, locale)));
        lock (gate) Find(code).Start(id, DateTimeOffset.UtcNow);
    }
    public void SelectCharacter(string id, string code, string avatarId) { lock (gate) Find(code).SelectCharacter(id, avatarId, DateTimeOffset.UtcNow); }
    public void Next(string id, string code) { lock (gate) Find(code).NextRound(id, DateTimeOffset.UtcNow); }
    public void Submit(string id, string code, string questionId, string optionId) { lock (gate) Find(code).Submit(id, questionId, optionId, DateTimeOffset.UtcNow); }
    public void ConfirmSoloAnswer(string id, string code, string questionId, string optionId) { lock (gate) Find(code).ConfirmSoloAnswer(id, questionId, optionId, DateTimeOffset.UtcNow); }
    public void Leave(string id, string code) { lock (gate) { var room = Find(code); room.Leave(id, DateTimeOffset.UtcNow); if ((room.IsSolo && room.HostId == id) || room.Players.Count == 0) rooms.Remove(room.Code); } }
    public async Task Disconnect(string connection)
    {
        List<string> affected;
        lock (gate) { affected = rooms.Values.Where(r => r.Players.Values.Concat(r.Audience.Values).Any(p => p.Connections.Contains(connection))).Select(r => r.Code).ToList(); foreach (var code in affected) rooms[code].Disconnect(connection, DateTimeOffset.UtcNow); }
        foreach (var code in affected) await Broadcast(code);
    }
    public async Task Broadcast(string code)
    {
        List<(List<string> Connections, QuizRoomView View)> messages;
        lock (gate)
        {
            if (!rooms.TryGetValue(Normalize(code), out var room)) return;
            messages = room.Players.Values.Concat(room.Audience.Values).Select(p => (p.Connections.ToList(), room.View(p.Id, DateTimeOffset.UtcNow))).ToList();
        }
        foreach (var (connections, view) in messages) if (connections.Count > 0) await hub.Clients.Clients(connections).SendAsync("RoomUpdated", view);
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var ticker = new PeriodicTimer(TimeSpan.FromMilliseconds(500));
        try
        {
            while (await ticker.WaitForNextTickAsync(stoppingToken))
            {
                var changed = new List<string>();
                lock (gate)
                {
                    var now = DateTimeOffset.UtcNow;
                    foreach (var id in generating.Where(p => now - p.Value > TimeSpan.FromMinutes(2)).Select(p => p.Key).ToList()) generating.Remove(id);
                    foreach (var room in rooms.Values.ToList())
                    {
                        if (room.Players.Count == 0 || now - room.CreatedAt > TimeSpan.FromHours(2) || now - room.UpdatedAt > TimeSpan.FromMinutes(room.Status == "finished" ? 15 : 60)) { rooms.Remove(room.Code); continue; }
                        if (room.Tick(now)) changed.Add(room.Code);
                    }
                }
                foreach (var code in changed) try { await Broadcast(code); } catch (Exception ex) { logger.LogWarning(ex, "Unable to broadcast quiz room"); }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
