namespace GamifiedLearningSystem.Application.DTOs;
public record RegisterRequest(string FirstName, string LastName, string Email, string Password, string ConfirmPassword, string Role = "STUDENT");
public record LoginRequest(string Email, string Password, bool RememberMe = false);
public record AttemptRequest(string Answer, string SessionId, string RequestId);
public record HintRequest(string TaskId);
public record ForgotRequest(string Email);
public record ResetRequest(string Token, string Password, string ConfirmPassword);
public record ProfileRequest(string FirstName, string LastName, string Bio, string AvatarUrl);
