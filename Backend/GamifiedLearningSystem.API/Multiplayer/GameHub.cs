using GamifiedLearningSystem.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace GamifiedLearningSystem.API.Multiplayer;

[Authorize]
public sealed class GameHub(MultiplayerService games) : Hub
{
    private string StudentId => Context.User?.FindFirst("studentId")?.Value ?? throw new HubException("studentRequired");
    private static async Task<T> Run<T>(Func<Task<T>> action)
    {
        try { return await action(); }
        catch (GameRuleException ex) { throw new HubException(ex.Message); }
        catch (GamifiedLearningSystem.Application.Services.DataException) { throw new HubException("serverUnavailable"); }
        catch (HttpRequestException) { throw new HubException("serverUnavailable"); }
    }
    public Task<QuizRoomView> CreateRoom(string courseId, int questionCount, int roundSeconds) => Run(() => games.Create(StudentId, Context.ConnectionId, courseId, questionCount, roundSeconds));
    public Task<QuizRoomView> CreateSavedQuizRoom(string quizId, int roundSeconds, string avatarId, bool withBots, string language) => Run(() => games.CreateSaved(StudentId, Context.ConnectionId, quizId, roundSeconds, avatarId, withBots, language, Context.ConnectionAborted));
    public Task<QuizRoomView> CreateStudioRoom(string courseId, int questionCount, int roundSeconds, string avatarId) => Run(() => games.Create(StudentId, Context.ConnectionId, courseId, questionCount, roundSeconds, avatarId, 5));
    public Task<QuizRoomView> CreateTextRoom(string title, string sourceText, int questionCount, int roundSeconds, string avatarId) => Run(() => games.CreateText(StudentId, Context.ConnectionId, title, sourceText, questionCount, roundSeconds, avatarId, Context.ConnectionAborted));
    public Task<QuizRoomView> JoinRoom(string code) => Run(async () => { var view = await games.Join(StudentId, Context.ConnectionId, code); await games.Broadcast(code); return view; });
    public Task<QuizRoomView> JoinStudioRoom(string code, string avatarId) => Run(async () => { var view = await games.Join(StudentId, Context.ConnectionId, code, avatarId); await games.Broadcast(code); return view; });
    public Task<QuizRoomView> CreateLocalizedStudioRoom(string courseId, int questionCount, int roundSeconds, string avatarId, string language) => Run(() => games.Create(StudentId, Context.ConnectionId, courseId, questionCount, roundSeconds, avatarId, 5, language));
    public Task<QuizRoomView> CreateLocalizedTextRoom(string title, string sourceText, int questionCount, int roundSeconds, string avatarId, string language) => Run(() => games.CreateText(StudentId, Context.ConnectionId, title, sourceText, questionCount, roundSeconds, avatarId, Context.ConnectionAborted, language));
    public Task<QuizRoomView> JoinLocalizedStudioRoom(string code, string avatarId, string language) => Run(async () => { var view = await games.Join(StudentId, Context.ConnectionId, code, avatarId, language); await games.Broadcast(code); return view; });
    public Task<QuizRoomView> JoinByInvite(string code, string inviteToken, string avatarId, string language) => Run(async () => { var view = await games.Join(StudentId, Context.ConnectionId, code, avatarId, language, inviteToken); await games.Broadcast(code); return view; });
    public Task<QuizRoomView> SetRoomLanguage(string code, string language) => Run(async () => { var view = await games.SetLanguage(StudentId, code, language); await games.Broadcast(code); return view; });
    public Task<bool> SelectCharacter(string code, string avatarId) => Run(async () => { games.SelectCharacter(StudentId, code, avatarId); await games.Broadcast(code); return true; });
    public Task<bool> StartGame(string code) => Run(async () => { await games.Start(StudentId, code); await games.Broadcast(code); return true; });
    public Task<bool> NextRound(string code) => Run(async () => { games.Next(StudentId, code); await games.Broadcast(code); return true; });
    public Task<bool> SubmitAnswer(string code, string questionId, string optionId) => Run(async () => { games.Submit(StudentId, code, questionId, optionId); await games.Broadcast(code); return true; });
    public Task<bool> ConfirmSoloAnswer(string code, string questionId, string optionId) => Run(async () => { games.ConfirmSoloAnswer(StudentId, code, questionId, optionId); await games.Broadcast(code); return true; });
    public Task<bool> LeaveRoom(string code) => Run(async () => { games.Leave(StudentId, code); await games.Broadcast(code); return true; });
    public override async Task OnDisconnectedAsync(Exception? exception) { await games.Disconnect(Context.ConnectionId); await base.OnDisconnectedAsync(exception); }
}
