namespace Wingman;

/// <summary>
/// Scaffold only. The full Wingman .NET client is not yet implemented.
/// See sdk/node for the reference implementation and sdk/dotnet/README.md
/// for the planned API.
/// </summary>
public sealed class WingmanClient
{
    public WingmanClient(WingmanClientOptions options)
        => throw new NotImplementedException(
            "Wingman.Sdk for .NET is not yet implemented. " +
            "See sdk/node for the working reference client.");
}

public sealed class WingmanClientOptions
{
    public string ApiKey { get; init; } = string.Empty;
    public string BaseUrl { get; init; } = "https://wingman.err403.com";
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(60);
    public int MaxRetries { get; init; } = 2;
}
