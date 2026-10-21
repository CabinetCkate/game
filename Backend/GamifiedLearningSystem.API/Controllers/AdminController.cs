using System.Text.Json.Nodes;
using GamifiedLearningSystem.Application.AI;
using GamifiedLearningSystem.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
namespace GamifiedLearningSystem.API.Controllers;
[ApiController,Authorize(Roles="ADMIN"),Route("api/admin")]
public sealed class AdminController(IDataRepository data,IAIService ai):ControllerBase
{
 [HttpGet("{resource}")] public Task<JsonNode> Get(string resource,CancellationToken ct,int page=1)=>data.SendAsync(HttpMethod.Get,"admin/"+Uri.EscapeDataString(resource)+"?page="+Math.Max(1,page),null,ct);
 [HttpPost("{resource}")] public Task<JsonNode> Save(string resource,JsonObject body,CancellationToken ct)=>data.SendAsync(HttpMethod.Post,"admin/"+Uri.EscapeDataString(resource),body,ct);
 [HttpDelete("{resource}/{id}")] public Task<JsonNode> Delete(string resource,string id,CancellationToken ct)=>data.SendAsync(HttpMethod.Delete,"admin/"+Uri.EscapeDataString(resource)+"/"+Uri.EscapeDataString(id),null,ct);
 [HttpPost("ai/generate-task")] public Task<JsonNode> Generate(JsonObject body,CancellationToken ct)=>ai.GenerateTaskAsync(body,ct);
}
