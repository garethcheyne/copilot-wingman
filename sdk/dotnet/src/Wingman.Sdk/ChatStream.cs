using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;

namespace Wingman;

/// <summary>
/// Async-iterable wrapper around an SSE response body. Yields parsed JSON
/// chunks; `[DONE]` terminates the stream; `event: error` raises an
/// <see cref="APIException"/>.
/// </summary>
public sealed class ChatStream : IAsyncEnumerable<ChatStreamChunk>, IAsyncDisposable
{
    private readonly HttpResponseMessage _response;
    private bool _consumed;

    internal ChatStream(HttpResponseMessage response)
    {
        _response = response;
    }

    public async IAsyncEnumerator<ChatStreamChunk> GetAsyncEnumerator(
        CancellationToken ct = default)
    {
        if (_consumed)
            throw new WingmanException("Cannot iterate a consumed stream; issue a new request to stream again.");
        _consumed = true;

        using var stream = await _response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        var buffer = new StringBuilder();
        var chars = new char[4096];

        while (!reader.EndOfStream)
        {
            ct.ThrowIfCancellationRequested();
            var read = await reader.ReadAsync(chars, 0, chars.Length).ConfigureAwait(false);
            if (read <= 0) break;
            buffer.Append(chars, 0, read);

            while (true)
            {
                var bufStr = buffer.ToString();
                var sep = bufStr.IndexOf("\n\n", StringComparison.Ordinal);
                if (sep < 0) break;
                var frame = bufStr[..sep];
                buffer.Clear();
                buffer.Append(bufStr[(sep + 2)..]);

                var (eventName, data) = ParseFrame(frame);
                if (data is null) continue;
                if (data == "[DONE]") yield break;

                if (eventName == "error")
                {
                    throw APIException.Generate(null, data, "Stream error", null);
                }

                ChatStreamChunk? chunk = null;
                try
                {
                    chunk = JsonSerializer.Deserialize<ChatStreamChunk>(data, JsonOpts.Default);
                }
                catch (JsonException)
                {
                    chunk = new ChatStreamChunk { Content = data };
                }
                if (chunk is not null) yield return chunk;
            }
        }
    }

    private static (string? Event, string? Data) ParseFrame(string frame)
    {
        string? eventName = null;
        var dataLines = new List<string>();
        foreach (var rawLine in frame.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r');
            if (string.IsNullOrEmpty(line) || line.StartsWith(':')) continue;
            var colon = line.IndexOf(':');
            string field;
            string value;
            if (colon < 0)
            {
                field = line;
                value = string.Empty;
            }
            else
            {
                field = line[..colon];
                value = line[(colon + 1)..];
                if (value.StartsWith(' ')) value = value[1..];
            }
            if (field == "event") eventName = value;
            else if (field == "data") dataLines.Add(value);
        }
        if (dataLines.Count == 0) return (eventName, null);
        return (eventName, string.Join("\n", dataLines));
    }

    public ValueTask DisposeAsync()
    {
        _response.Dispose();
        return ValueTask.CompletedTask;
    }

    /// <summary>Iterates the stream and yields only the text deltas.</summary>
    public async IAsyncEnumerable<string> TextDeltasAsync(
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await foreach (var chunk in this.WithCancellation(ct).ConfigureAwait(false))
        {
            var delta = chunk.Choices is { Count: > 0 } ? chunk.Choices[0].Delta?.Content : null;
            if (!string.IsNullOrEmpty(delta)) yield return delta!;
        }
    }
}
