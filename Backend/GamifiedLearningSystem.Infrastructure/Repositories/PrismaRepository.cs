using System.Net.Http.Json;
using System.Text.Json.Nodes;
using GamifiedLearningSystem.Application.Interfaces;
using GamifiedLearningSystem.Application.Services;
namespace GamifiedLearningSystem.Infrastructure.Repositories;
public sealed class PrismaRepository(HttpClient http) : IDataRepository
{
    public async Task<JsonNode> SendAsync(HttpMethod method, string path, object? body, CancellationToken ct) {
        using var request=new HttpRequestMessage(method,path);
        if(body is not null) request.Content=JsonContent.Create(body);
        using var response=await http.SendAsync(request,ct);
        var text=await response.Content.ReadAsStringAsync(ct);
        var json=JsonNode.Parse(text) ?? new JsonObject();
        if(!response.IsSuccessStatusCode) throw new DataException((int)response.StatusCode,json["message"]?.GetValue<string>() ?? "Data service request failed.");
        return json;
    }
}
