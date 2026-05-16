namespace Wingman;

public sealed class HealthResource
{
    private readonly WingmanClient _client;
    internal HealthResource(WingmanClient client) => _client = client;

    public Task<HealthResponse> CheckAsync(CancellationToken ct = default)
        => _client.SendJsonAsync<HealthResponse>(HttpMethod.Get, "/api/health", null, ct);
}

public sealed record HealthResponse
{
    public string? Status { get; init; }
    public string? Version { get; init; }
    public long? Uptime { get; init; }
}
