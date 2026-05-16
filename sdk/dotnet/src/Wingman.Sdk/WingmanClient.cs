using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Wingman;

/// <summary>
/// Synchronous-friendly Wingman client. All public operations return tasks.
/// </summary>
public sealed class WingmanClient : IDisposable
{
    internal static readonly string SdkVersion = typeof(WingmanClient).Assembly
        .GetName().Version?.ToString(3) ?? "0.1.0";

    internal readonly HttpClient Http;
    internal readonly WingmanClientOptions Options;
    private readonly bool _ownsHttp;

    public HealthResource Health { get; }
    public ModelsResource Models { get; }
    public ChatResource Chat { get; }

    public WingmanClient(WingmanClientOptions options, HttpClient? httpClient = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (string.IsNullOrWhiteSpace(options.ApiKey))
        {
            var envKey = Environment.GetEnvironmentVariable("WINGMAN_API_KEY");
            if (string.IsNullOrWhiteSpace(envKey))
            {
                throw new ArgumentException(
                    "Wingman SDK: missing ApiKey. Set WingmanClientOptions.ApiKey or the " +
                    "WINGMAN_API_KEY environment variable.", nameof(options));
            }
            options = options with { ApiKey = envKey };
        }
        if (string.IsNullOrWhiteSpace(options.BaseUrl))
        {
            var envBase = Environment.GetEnvironmentVariable("WINGMAN_BASE_URL");
            if (string.IsNullOrWhiteSpace(envBase))
            {
                throw new ArgumentException(
                    "Wingman SDK: missing BaseUrl. Set WingmanClientOptions.BaseUrl or the " +
                    "WINGMAN_BASE_URL environment variable.", nameof(options));
            }
            options = options with { BaseUrl = envBase };
        }
        Options = options;

        if (httpClient is null)
        {
            Http = new HttpClient { Timeout = options.Timeout };
            _ownsHttp = true;
        }
        else
        {
            Http = httpClient;
            _ownsHttp = false;
        }

        Health = new HealthResource(this);
        Models = new ModelsResource(this);
        Chat = new ChatResource(this);
    }

    public WingmanClient(string apiKey, string baseUrl)
        : this(new WingmanClientOptions { ApiKey = apiKey, BaseUrl = baseUrl })
    {
    }

    internal Uri BuildUri(string path)
    {
        var basePath = Options.BaseUrl.TrimEnd('/');
        var p = path.StartsWith('/') ? path : "/" + path;
        return new Uri(basePath + p);
    }

    internal HttpRequestMessage BuildRequest(
        HttpMethod method,
        string path,
        object? body,
        IReadOnlyDictionary<string, string>? extraHeaders = null)
    {
        var req = new HttpRequestMessage(method, BuildUri(path));
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Options.ApiKey);
        req.Headers.UserAgent.ParseAdd($"wingman-sdk-dotnet/{SdkVersion}");
        req.Headers.TryAddWithoutValidation("X-Wingman-SDK", $"dotnet/{SdkVersion}");
        if (Options.DefaultHeaders is not null)
        {
            foreach (var kv in Options.DefaultHeaders)
                req.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
        }
        if (extraHeaders is not null)
        {
            foreach (var kv in extraHeaders)
                req.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
        }
        if (body is not null)
        {
            var json = JsonSerializer.Serialize(body, JsonOpts.Default);
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }
        return req;
    }

    internal async Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string path,
        object? body,
        HttpCompletionOption completion,
        CancellationToken ct)
    {
        var attempts = Math.Max(0, Options.MaxRetries) + 1;
        Exception? lastNetworkException = null;
        for (int attempt = 0; attempt < attempts; attempt++)
        {
            using var req = BuildRequest(method, path, body);
            HttpResponseMessage? response = null;
            try
            {
                response = await Http.SendAsync(req, completion, ct).ConfigureAwait(false);
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                lastNetworkException = new APIConnectionTimeoutException();
                if (attempt + 1 < attempts)
                {
                    await Task.Delay(Backoff(attempt), ct).ConfigureAwait(false);
                    continue;
                }
                throw lastNetworkException;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw new APIUserAbortException();
            }
            catch (HttpRequestException ex)
            {
                lastNetworkException = new APIConnectionException($"Network error: {ex.Message}", ex);
                if (attempt + 1 < attempts)
                {
                    await Task.Delay(Backoff(attempt), ct).ConfigureAwait(false);
                    continue;
                }
                throw lastNetworkException;
            }

            if (response.IsSuccessStatusCode)
                return response;

            var status = (int)response.StatusCode;
            var retryable = status == 408 || status == 409 || status == 429 || status >= 500;
            if (retryable && attempt + 1 < attempts)
            {
                var retryAfter = ParseRetryAfter(response.Headers.RetryAfter);
                response.Dispose();
                await Task.Delay(retryAfter ?? Backoff(attempt), ct).ConfigureAwait(false);
                continue;
            }

            string text = string.Empty;
            try { text = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false); }
            catch { /* swallow */ }
            var headersDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var h in response.Headers) headersDict[h.Key] = string.Join(",", h.Value);
            foreach (var h in response.Content.Headers) headersDict[h.Key] = string.Join(",", h.Value);
            response.Dispose();
            throw APIException.Generate(status, text, response.ReasonPhrase, headersDict);
        }
        throw lastNetworkException ?? new APIConnectionException("Exhausted retries");
    }

    internal async Task<T> SendJsonAsync<T>(
        HttpMethod method,
        string path,
        object? body,
        CancellationToken ct)
    {
        using var resp = await SendAsync(method, path, body, HttpCompletionOption.ResponseContentRead, ct)
            .ConfigureAwait(false);
        var stream = await resp.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
        var result = await JsonSerializer.DeserializeAsync<T>(stream, JsonOpts.Default, ct)
            .ConfigureAwait(false);
        return result is null
            ? throw new APIException((int)resp.StatusCode, null, "Empty response body", null)
            : result;
    }

    private static TimeSpan Backoff(int attempt)
    {
        var baseMs = Math.Min(500 * Math.Pow(2, attempt), 8000);
        var jitter = new Random().NextDouble() * baseMs * 0.2;
        return TimeSpan.FromMilliseconds(baseMs + jitter);
    }

    private static TimeSpan? ParseRetryAfter(RetryConditionHeaderValue? header)
    {
        if (header is null) return null;
        if (header.Delta is { } d) return d > TimeSpan.FromSeconds(30) ? TimeSpan.FromSeconds(30) : d;
        if (header.Date is { } when)
        {
            var diff = when - DateTimeOffset.UtcNow;
            return diff > TimeSpan.Zero ? diff : TimeSpan.Zero;
        }
        return null;
    }

    public void Dispose()
    {
        if (_ownsHttp) Http.Dispose();
    }
}

public sealed record WingmanClientOptions
{
    public string ApiKey { get; init; } = string.Empty;
    public string BaseUrl { get; init; } = string.Empty;
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(60);
    public int MaxRetries { get; init; } = 2;
    public IReadOnlyDictionary<string, string>? DefaultHeaders { get; init; }
}

internal static class JsonOpts
{
    public static readonly JsonSerializerOptions Default = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };
}
