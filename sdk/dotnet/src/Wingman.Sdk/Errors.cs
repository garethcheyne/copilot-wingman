using System.Text.Json;

namespace Wingman;

/// <summary>Base class for all Wingman SDK exceptions.</summary>
public class WingmanException : Exception
{
    public WingmanException(string message) : base(message) { }
    public WingmanException(string message, Exception inner) : base(message, inner) { }
}

/// <summary>HTTP error response from the Wingman API.</summary>
public class APIException : WingmanException
{
    public int? Status { get; }
    public IReadOnlyDictionary<string, string>? Headers { get; }
    public string? RawBody { get; }
    public string? RequestId { get; private set; }

    public APIException(
        int? status,
        string? rawBody,
        string? message,
        IReadOnlyDictionary<string, string>? headers)
        : base(BuildMessage(status, rawBody, message))
    {
        Status = status;
        RawBody = rawBody;
        Headers = headers;
        SetRequestId(headers);
    }

    public APIException(
        int? status,
        string? rawBody,
        string? message,
        IReadOnlyDictionary<string, string>? headers,
        Exception inner)
        : base(BuildMessage(status, rawBody, message), inner)
    {
        Status = status;
        RawBody = rawBody;
        Headers = headers;
        SetRequestId(headers);
    }

    private void SetRequestId(IReadOnlyDictionary<string, string>? headers)
    {
        if (headers is null) return;
        if (headers.TryGetValue("x-request-id", out var rid)) RequestId = rid;
        else if (headers.TryGetValue("request-id", out var rid2)) RequestId = rid2;
    }

    private static string BuildMessage(int? status, string? rawBody, string? fallback)
    {
        string? extracted = null;
        if (!string.IsNullOrWhiteSpace(rawBody))
        {
            try
            {
                using var doc = JsonDocument.Parse(rawBody);
                var root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.Object)
                {
                    if (root.TryGetProperty("error", out var err))
                    {
                        if (err.ValueKind == JsonValueKind.String)
                            extracted = err.GetString();
                        else if (err.ValueKind == JsonValueKind.Object &&
                                 err.TryGetProperty("message", out var em) &&
                                 em.ValueKind == JsonValueKind.String)
                            extracted = em.GetString();
                    }
                    if (extracted is null &&
                        root.TryGetProperty("message", out var msg) &&
                        msg.ValueKind == JsonValueKind.String)
                    {
                        extracted = msg.GetString();
                    }
                }
            }
            catch (JsonException)
            {
                extracted = rawBody;
            }
        }
        var final = extracted ?? fallback ?? "API request failed";
        return status.HasValue ? $"{status} {final}" : final;
    }

    public static APIException Generate(
        int? status,
        string? rawBody,
        string? message,
        IReadOnlyDictionary<string, string>? headers)
    {
        if (status is null) return new APIConnectionException(message ?? "Connection failed");
        return status switch
        {
            400 => new BadRequestException(status, rawBody, message, headers),
            401 => new AuthenticationException(status, rawBody, message, headers),
            403 => new PermissionDeniedException(status, rawBody, message, headers),
            404 => new NotFoundException(status, rawBody, message, headers),
            409 => new ConflictException(status, rawBody, message, headers),
            422 => new UnprocessableEntityException(status, rawBody, message, headers),
            429 => new RateLimitException(status, rawBody, message, headers),
            >= 500 and < 600 => new InternalServerException(status, rawBody, message, headers),
            _ => new APIException(status, rawBody, message, headers),
        };
    }
}

public class APIConnectionException : APIException
{
    public APIConnectionException(string message)
        : base(null, null, message, null) { }
    public APIConnectionException(string message, Exception inner)
        : base(null, null, message, null, inner) { }
}

public sealed class APIConnectionTimeoutException : APIConnectionException
{
    public APIConnectionTimeoutException() : base("Request timed out") { }
}

public sealed class APIUserAbortException : APIConnectionException
{
    public APIUserAbortException() : base("Request was aborted") { }
}

public sealed class BadRequestException : APIException
{
    public BadRequestException(int? s, string? b, string? m, IReadOnlyDictionary<string, string>? h)
        : base(s, b, m, h) { }
}

public sealed class AuthenticationException : APIException
{
    public AuthenticationException(int? s, string? b, string? m, IReadOnlyDictionary<string, string>? h)
        : base(s, b, m, h) { }
}

public sealed class PermissionDeniedException : APIException
{
    public PermissionDeniedException(int? s, string? b, string? m, IReadOnlyDictionary<string, string>? h)
        : base(s, b, m, h) { }
}

public sealed class NotFoundException : APIException
{
    public NotFoundException(int? s, string? b, string? m, IReadOnlyDictionary<string, string>? h)
        : base(s, b, m, h) { }
}

public sealed class ConflictException : APIException
{
    public ConflictException(int? s, string? b, string? m, IReadOnlyDictionary<string, string>? h)
        : base(s, b, m, h) { }
}

public sealed class UnprocessableEntityException : APIException
{
    public UnprocessableEntityException(int? s, string? b, string? m, IReadOnlyDictionary<string, string>? h)
        : base(s, b, m, h) { }
}

public sealed class RateLimitException : APIException
{
    public RateLimitException(int? s, string? b, string? m, IReadOnlyDictionary<string, string>? h)
        : base(s, b, m, h) { }
}

public sealed class InternalServerException : APIException
{
    public InternalServerException(int? s, string? b, string? m, IReadOnlyDictionary<string, string>? h)
        : base(s, b, m, h) { }
}
