using GamifiedLearningSystem.Application.DTOs;
using GamifiedLearningSystem.Application.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
namespace GamifiedLearningSystem.API.Controllers;
[ApiController,Route("api/auth"),EnableRateLimiting("auth")]
public sealed class AuthController(AuthService auth):ControllerBase
{
 [HttpPost("register")] public Task<System.Text.Json.Nodes.JsonNode> Register(RegisterRequest r,CancellationToken ct)=>auth.RegisterAsync(r,ct);
 [HttpPost("login")] public Task<System.Text.Json.Nodes.JsonNode> Login(LoginRequest r,CancellationToken ct)=>auth.LoginAsync(r,ct);
 [HttpPost("refresh"),EnableRateLimiting("session")] public Task<System.Text.Json.Nodes.JsonNode> Refresh(TokenRequest r,CancellationToken ct)=>auth.RefreshAsync(r.RefreshToken,ct);
 [HttpPost("logout")] public Task<System.Text.Json.Nodes.JsonNode> Logout(TokenRequest r,CancellationToken ct)=>auth.LogoutAsync(r.RefreshToken,ct);
 [HttpPost("forgot-password")] public Task<System.Text.Json.Nodes.JsonNode> Forgot(ForgotRequest r,CancellationToken ct)=>auth.ForgotAsync(r,ct);
 [HttpPost("reset-password")] public Task<System.Text.Json.Nodes.JsonNode> Reset(ResetRequest r,CancellationToken ct)=>auth.ResetAsync(r,ct);
}
public record TokenRequest(string RefreshToken);
