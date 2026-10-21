using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using GamifiedLearningSystem.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
namespace GamifiedLearningSystem.Infrastructure.Services;
public sealed class JwtTokenIssuer(IConfiguration config) : ITokenIssuer
{
    public string Issue(string userId,string role,string? studentId) {
        var claims=new List<Claim>{new(JwtRegisteredClaimNames.Sub,userId),new(ClaimTypes.Role,role),new(JwtRegisteredClaimNames.Jti,Guid.NewGuid().ToString())};
        if(studentId is not null) claims.Add(new("studentId",studentId));
        var token=new JwtSecurityToken(config["Jwt:Issuer"],config["Jwt:Audience"],claims,expires:DateTime.UtcNow.AddMinutes(15),
            signingCredentials:new(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Secret"]!)),SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
