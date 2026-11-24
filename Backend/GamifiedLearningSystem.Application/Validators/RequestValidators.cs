using FluentValidation;
using GamifiedLearningSystem.Application.DTOs;
namespace GamifiedLearningSystem.Application.Validators;
public sealed class RegisterValidator : AbstractValidator<RegisterRequest>
{
    public RegisterValidator() {
        RuleFor(x=>x.Email).NotEmpty().WithErrorCode("emailRequired").EmailAddress().WithErrorCode("emailInvalid").MaximumLength(191).WithErrorCode("emailInvalid");
        RuleFor(x=>x.FirstName).NotEmpty().WithErrorCode("firstNameRequired").MaximumLength(80).WithErrorCode("nameTooLong");
        RuleFor(x=>x.LastName).NotEmpty().WithErrorCode("lastNameRequired").MaximumLength(80).WithErrorCode("nameTooLong");
        RuleFor(x=>x.Role).Must(x=>x is "STUDENT" or "TEACHER").WithErrorCode("roleInvalid");
        RuleFor(x=>x.Password).NotEmpty().WithErrorCode("passwordRequired").MinimumLength(8).WithErrorCode("passwordShort").MaximumLength(128).WithErrorCode("passwordLong").Matches("[A-Z]").WithErrorCode("passwordRules").Matches("[a-z]").WithErrorCode("passwordRules").Matches("[0-9]").WithErrorCode("passwordRules").Matches("[^a-zA-Z0-9]").WithErrorCode("passwordRules");
        RuleFor(x=>x.ConfirmPassword).NotEmpty().WithErrorCode("confirmRequired").Equal(x=>x.Password).WithErrorCode("passwordMismatch");
    }
}
public sealed class AttemptValidator : AbstractValidator<AttemptRequest>
{
    public AttemptValidator() {
        RuleFor(x=>x.Answer).NotEmpty().MaximumLength(1000);
        RuleFor(x=>x.SessionId).Must(x=>Guid.TryParse(x,out _));
        RuleFor(x=>x.RequestId).Must(x=>Guid.TryParse(x,out _));
    }
}
