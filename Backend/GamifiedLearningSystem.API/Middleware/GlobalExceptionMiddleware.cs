using FluentValidation;
using GamifiedLearningSystem.Application.Services;
namespace GamifiedLearningSystem.API.Middleware;
public sealed class GlobalExceptionMiddleware(RequestDelegate next,ILogger<GlobalExceptionMiddleware> logger)
{
 public async Task InvokeAsync(HttpContext ctx) {
  try{await next(ctx);}catch(Exception ex){
   if(ex is OperationCanceledException && ctx.RequestAborted.IsCancellationRequested)return;
   var status=ex switch{DataException d=>d.Status,ValidationException=>400,HttpRequestException or OperationCanceledException=>503,_=>500};
   if(status>=500)logger.LogError(ex,"Request failed: {TraceId}",ctx.TraceIdentifier);
   ctx.Response.StatusCode=status;
   var errors=ex is ValidationException validation?validation.Errors.Select(e=>new{field=e.PropertyName,code=e.ErrorCode}).ToArray():null;
   await ctx.Response.WriteAsJsonAsync(new{code=ex is DataException data?data.Code:null,errors,message=ex is DataException or ValidationException?ex.Message:status==503?"Unable to connect to the data service.":"Unable to complete the request.",traceId=ctx.TraceIdentifier});
  }
 }
}
