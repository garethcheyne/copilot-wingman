using System.Text.Json;

namespace Wingman;

public sealed class ModelsResource
{
    private readonly WingmanClient _client;
    internal ModelsResource(WingmanClient client) => _client = client;

    public async Task<IReadOnlyList<ModelInfo>> ListAsync(CancellationToken ct = default)
    {
        using var resp = await _client.SendAsync(HttpMethod.Get, "/api/models", null,
            HttpCompletionOption.ResponseContentRead, ct).ConfigureAwait(false);
        await using var stream = await resp.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct).ConfigureAwait(false);
        var root = doc.RootElement;

        JsonElement arr;
        if (root.ValueKind == JsonValueKind.Array)
            arr = root;
        else if (root.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            arr = data;
        else if (root.TryGetProperty("models", out var models) && models.ValueKind == JsonValueKind.Array)
            arr = models;
        else
            return Array.Empty<ModelInfo>();

        var list = new List<ModelInfo>(arr.GetArrayLength());
        foreach (var item in arr.EnumerateArray())
        {
            var info = item.Deserialize<ModelInfo>(JsonOpts.Default);
            if (info is not null) list.Add(info);
        }
        return list;
    }
}

public sealed record ModelInfo
{
    public string Id { get; init; } = string.Empty;
    public string? Provider { get; init; }
    public string? DisplayName { get; init; }
    public string? Description { get; init; }
}
