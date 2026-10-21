using System.Text.Json.Nodes;
namespace GamifiedLearningSystem.Application.Interfaces;
public interface IDataRepository
{
    Task<JsonNode> SendAsync(HttpMethod method, string path, object? body, CancellationToken ct);
}
public interface ITokenIssuer
{
    string Issue(string userId, string role, string? studentId);
}
