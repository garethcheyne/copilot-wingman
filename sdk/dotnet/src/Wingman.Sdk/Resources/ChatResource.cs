using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;

namespace Wingman;

public sealed class ChatResource
{
    private readonly WingmanClient _client;
    internal ChatResource(WingmanClient client) => _client = client;

    /// <summary>POST /api/chat (non-streaming).</summary>
    public Task<ChatResponse> CreateAsync(ChatCreateParams parameters, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(parameters);
        var body = parameters with { Stream = false };
        return _client.SendJsonAsync<ChatResponse>(HttpMethod.Post, "/api/chat", body, ct);
    }

    /// <summary>POST /api/chat (streaming SSE). Caller must dispose the returned <see cref="ChatStream"/>.</summary>
    public async Task<ChatStream> StreamAsync(ChatCreateParams parameters, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(parameters);
        var body = parameters with { Stream = true };
        var resp = await _client.SendAsync(HttpMethod.Post, "/api/chat", body,
            HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        return new ChatStream(resp);
    }

    /// <summary>Convenience: stream text deltas only.</summary>
    public async IAsyncEnumerable<string> StreamTextAsync(
        ChatCreateParams parameters,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await using var stream = await StreamAsync(parameters, ct).ConfigureAwait(false);
        await foreach (var delta in stream.TextDeltasAsync(ct).ConfigureAwait(false))
            yield return delta;
    }
}

public sealed record ChatCreateParams
{
    public string SessionKey { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
    public string? SystemPrompt { get; init; }
    public string? Model { get; init; }
    public bool? Stream { get; init; }
    public IReadOnlyList<string>? Images { get; init; }
}

public sealed record ChatResponse
{
    public string? SessionId { get; init; }
    public string? Message { get; init; }
}

public sealed record ChatStreamChunk
{
    public List<ChatStreamChoice>? Choices { get; init; }

    /// <summary>Optional fallback content when the chunk isn't standard OpenAI-shape.</summary>
    [JsonIgnore]
    public string? Content { get; init; }
}

public sealed record ChatStreamChoice
{
    public ChatStreamDelta? Delta { get; init; }
    public int? Index { get; init; }
    [JsonPropertyName("finish_reason")]
    public string? FinishReason { get; init; }
}

public sealed record ChatStreamDelta
{
    public string? Role { get; init; }
    public string? Content { get; init; }
}
