using System.IO.Compression;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using GamifiedLearningSystem.Application.AI;
using GamifiedLearningSystem.Application.Services;
using GamifiedLearningSystem.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace GamifiedLearningSystem.API.QuizLibrary;

public record CreateQuizRequest(string Title, string SourceText, string SourceKind, int QuestionCount, string Language);
public record ExtractQuizFileRequest(string Name, string Base64);
[ApiController, Authorize(Roles = "STUDENT"), Route("api/quiz-library")]
public sealed class QuizLibraryController(QuizLibraryStore store, IAIService ai) : ControllerBase
{
    private string Owner => User.FindFirst("studentId")?.Value ?? throw new DataException(403, "A student account is required.");
    [HttpGet] public async Task<object> List(CancellationToken ct) => (await store.List(Owner, ct)).Select(q => new { q.Id, q.Title, q.Language, q.SourceKind, q.CreatedAt, questionCount = q.Questions.Count });
    [HttpGet("{id}")] public Task<SavedQuiz> Get(string id, CancellationToken ct) => store.Get(Owner, id, ct);
    [HttpPost, EnableRateLimiting("auth"), RequestSizeLimit(700_000)]
    public async Task<SavedQuiz> Create(CreateQuizRequest request, CancellationToken ct)
    {
        var title = (request.Title ?? "").Trim(); var source = (request.SourceText ?? "").Trim();
        if (title.Length is < 1 or > 100 || source.Length is < 3 or > 100000 || request.SourceKind is not ("text" or "ready")
            || request.QuestionCount is < 1 or > 20 || request.Language is not ("kk" or "ru" or "en")) throw new DataException(400, "Check the topic title, source and question count.");
        try
        {
            List<QuizQuestion> questions;
            if (request.SourceKind == "ready") questions = ReadyQuiz.Parse(source, title);
            else
            {
                if (source.Length is < 80 or > 20000) throw new DataException(400, "Use 80–20,000 characters of lecture text.");
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct); timeout.CancelAfter(TimeSpan.FromSeconds(90));
                questions = GroundedQuiz.Parse(await ai.GenerateQuizAsync(title, source, request.QuestionCount, timeout.Token), title, source, request.QuestionCount);
                var views = questions.Select(q => new QuizQuestionView(q.Id, q.Title, q.Question, q.Options)).ToList();
                if (QuizLocalization.DetectLanguage(views) != request.Language)
                {
                    var display = await ai.TranslateQuizAsync(title, views, request.Language, timeout.Token);
                    questions = QuizLocalization.ApplyToCanonical(questions, display);
                }
            }
            return await store.Save(Owner, title, source, request.SourceKind, request.Language, questions, ct);
        }
        catch (GameRuleException e) { throw new DataException(400, e.Message, e.Message); }
    }
    [HttpPost("extract"), RequestSizeLimit(7_100_000)]
    public object Extract(ExtractQuizFileRequest request)
    {
        byte[] bytes;
        try { bytes = Convert.FromBase64String(request.Base64); }
        catch (FormatException) { throw new DataException(400, "The file could not be read."); }
        if (bytes.Length is < 1 or > 5_000_000) throw new DataException(400, "Choose a file up to 5 MB.");
        var extension = Path.GetExtension(request.Name).ToLowerInvariant(); string text;
        try
        {
            if (extension == ".pdf")
            {
                using var pdf = PdfDocument.Open(bytes);
                if (pdf.NumberOfPages > 150) throw new DataException(400, "Choose a PDF with up to 150 pages.");
                text = string.Join("\n\n", pdf.GetPages().Select(page => ContentOrderTextExtractor.GetText(page)));
            }
            else if (extension == ".docx")
            {
                using var archive = new ZipArchive(new MemoryStream(bytes));
                var document = archive.GetEntry("word/document.xml") ?? throw new InvalidDataException();
                if (document.Length > 5_000_000) throw new DataException(400, "This document contains too much text.");
                using var stream = document.Open();
                using var xml = XmlReader.Create(stream, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, MaxCharactersInDocument = 5_000_000 });
                XNamespace w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
                text = string.Join("\n", XDocument.Load(xml).Descendants(w + "p").Select(p => string.Concat(p.Descendants(w + "t").Select(t => t.Value))));
            }
            else if (extension is ".txt" or ".md" or ".json" or ".csv") text = new UTF8Encoding(false, true).GetString(bytes).TrimStart('\uFEFF');
            else throw new DataException(400, "Use PDF, DOCX, TXT, MD, JSON or CSV.");
        }
        catch (DataException) { throw; }
        catch (Exception e) when (e is not OutOfMemoryException) { throw new DataException(400, "The file could not be read. Try exporting it as DOCX or UTF-8 text."); }
        if (string.IsNullOrWhiteSpace(text)) throw new DataException(400, "No text found. Scanned images need text recognition first.");
        if (text.Length > 100000) throw new DataException(400, "The file contains over 100,000 characters. Upload a shorter extract.");
        return new { text };
    }
}
