# Wingman .NET SDK — planned

Status: **scaffold only.** The .NET client is not yet implemented.

## Planned API

```csharp
using Wingman;

var client = new WingmanClient(new WingmanClientOptions
{
    ApiKey = Environment.GetEnvironmentVariable("WINGMAN_API_KEY")!,
});

// Non-streaming
var res = await client.Chat.CreateAsync(new ChatCreateParams
{
    SessionKey = "my-session-id",
    Message = "Hello",
    Model = "claude-sonnet-4.6",
});
Console.WriteLine(res.Message);

// Streaming
await foreach (var delta in client.Chat.StreamAsync(new ChatCreateParams
{
    SessionKey = "my-session-id",
    Message = "Count to ten",
}))
{
    Console.Write(delta);
}

await client.Health.CheckAsync();
await client.Models.ListAsync();
```

## Planned package

- Target: `net8.0`
- NuGet: `Wingman.Sdk`
- HttpClient-based; `IAsyncEnumerable<string>` for streaming
- Error hierarchy mirroring the Node SDK (`WingmanException`, `ApiException`,
  `AuthenticationException`, `RateLimitException`, …)
- BaseUrl is **required** — supply your Wingman host explicitly or set the `WINGMAN_BASE_URL` env var

See [`../node/`](../node/) for the reference implementation in TypeScript.
