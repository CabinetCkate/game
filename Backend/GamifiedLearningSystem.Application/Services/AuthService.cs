using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using FluentValidation;
using GamifiedLearningSystem.Application.DTOs;
using GamifiedLearningSystem.Application.Interfaces;
using GamifiedLearningSystem.Application.Validators;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
namespace GamifiedLearningSystem.Application.Services;

public sealed class AuthService(IDataRepository data, ITokenIssuer tokens, IConfiguration config)
{
    private readonly PasswordHasher<string> hasher = new();
    private static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public async Task<JsonNode> RegisterAsync(RegisterRequest r, CancellationToken ct) {
        await new RegisterValidator().ValidateAndThrowAsync(r, ct);
        var email = r.Email.Trim().ToLowerInvariant();
        var user = await data.SendAsync(HttpMethod.Post, "auth/register", new { email, passwordHash=hasher.HashPassword(email, r.Password), r.FirstName, r.LastName }, ct);
        return await IssueAsync(user, false, ct);
    }
    public async Task<JsonNode> LoginAsync(LoginRequest r, CancellationToken ct) {
        if (string.IsNullOrWhiteSpace(r.Email) || string.IsNullOrEmpty(r.Password) || r.Password.Length > 128) throw new DataException(401,"Invalid email or password.");
        var user = await data.SendAsync(HttpMethod.Post, "auth/find", new { email=r.Email.Trim().ToLowerInvariant() }, ct);
        if (user["id"] is null || hasher.VerifyHashedPassword(r.Email, user["passwordHash"]!.GetValue<string>(), r.Password) == PasswordVerificationResult.Failed)
            throw new DataException(401,"Invalid email or password.");
        return await IssueAsync(user, r.RememberMe, ct);
    }
    private async Task<JsonNode> IssueAsync(JsonNode user, bool remember, CancellationToken ct) {
        var refresh = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        await data.SendAsync(HttpMethod.Post,"auth/token",new { userId=user["id"]!.GetValue<string>(), tokenHash=HashToken(refresh), expiresAt=DateTime.UtcNow.AddDays(remember ? 30 : 7) },ct);
        return Response(user, refresh);
    }
    private JsonObject Response(JsonNode user, string refresh) => new() {
        ["accessToken"]=tokens.Issue(user["id"]!.GetValue<string>(),user["role"]!.GetValue<string>(),user["student"]?["id"]?.GetValue<string>()),
        ["refreshToken"]=refresh,["expiresIn"]=900,["role"]=user["role"]!.DeepClone()
    };
    public async Task<JsonNode> RefreshAsync(string token, CancellationToken ct) {
        if (string.IsNullOrWhiteSpace(token) || token.Length>200) throw new DataException(401,"Invalid refresh token.");
        var next=Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        var user=await data.SendAsync(HttpMethod.Post,"auth/rotate",new { tokenHash=HashToken(token), newTokenHash=HashToken(next) },ct);
        return Response(user,next);
    }
    public Task<JsonNode> LogoutAsync(string token,CancellationToken ct) => data.SendAsync(HttpMethod.Post,"auth/revoke",new { tokenHash=HashToken(token) },ct);
    public async Task<JsonNode> ForgotAsync(ForgotRequest r,CancellationToken ct) {
        var token=Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var result=await data.SendAsync(HttpMethod.Post,"auth/forgot",new { email=r.Email.Trim().ToLowerInvariant(), tokenHash=HashToken(token) },ct);
        if(result["found"]?.GetValue<bool>()==true) {
            var pickup=config["PasswordReset:PickupDirectory"];
            if(!string.IsNullOrEmpty(pickup)) {
                Directory.CreateDirectory(pickup);
                await File.WriteAllTextAsync(Path.Combine(pickup,Guid.NewGuid()+".txt"),$"To: {r.Email}\nReset link: {config["FrontendUrl"]}/#reset?token={token}\nValid for 30 minutes.",ct);
            } else throw new DataException(503,"Password reset delivery is not configured.");
        }
        return new JsonObject { ["message"]="If the account exists, a reset message has been delivered." };
    }
    public async Task<JsonNode> ResetAsync(ResetRequest r,CancellationToken ct) {
        await new RegisterValidator().ValidateAndThrowAsync(new("Reset","User","reset@example.com",r.Password,r.ConfirmPassword),ct);
        return await data.SendAsync(HttpMethod.Post,"auth/reset",new { tokenHash=HashToken(r.Token), passwordHash=hasher.HashPassword("reset",r.Password) },ct);
    }
}
