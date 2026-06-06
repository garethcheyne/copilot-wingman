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

// Vision (images & PDFs)
// Pass base64 data URLs in Images. The server accepts both image data URLs
// (data:image/png;base64,...) and PDF data URLs (data:application/pdf;base64,...)
// PDFs are rendered server-side to per-page PNG images (max 5 pages per PDF).
var pdfBytes = await File.ReadAllBytesAsync("document.pdf");
var pdfB64 = Convert.ToBase64String(pdfBytes);
var pdfRes = await client.Chat.CreateAsync(new ChatCreateParams
{
    SessionKey = "pdf-demo",
    Message = "Summarise this document.",
    Model = "gpt-4o",
    Images = [$"data:application/pdf;base64,{pdfB64}"],
});
Console.WriteLine(pdfRes.Message);

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
