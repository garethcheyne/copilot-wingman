using System.Text;
using Wingman;

// Load .env from repo root (walk up from this file's working dir).
LoadDotEnv();

var apiKey = Env("WINGMAN_API_KEY") ?? Env("API_PROD_TESTING_KEY_01");
var baseUrl = Env("WINGMAN_BASE_URL") ?? Env("PROD_URL");
if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(baseUrl))
{
    Console.Error.WriteLine("Missing WINGMAN_API_KEY / WINGMAN_BASE_URL (or .env fallbacks API_PROD_TESTING_KEY_01 / PROD_URL).");
    return 2;
}

using var client = new WingmanClient(new WingmanClientOptions { ApiKey = apiKey!, BaseUrl = baseUrl! });
int failures = 0;
void Log(string label, bool ok, string info = "")
{
    var tag = ok ? "PASS" : "FAIL";
    if (!ok) failures++;
    Console.WriteLine($"[{tag}] {label}{(string.IsNullOrEmpty(info) ? "" : $" — {info}")}");
}

// 1) Health
try
{
    var h = await client.Health.CheckAsync();
    Log("health.check", !string.IsNullOrEmpty(h.Status), $"status={h.Status}");
}
catch (Exception ex) { Log("health.check", false, ex.Message); }

// 2) Models
string? firstModel = Env("WINGMAN_MODEL");
try
{
    var models = await client.Models.ListAsync();
    if (string.IsNullOrEmpty(firstModel)) firstModel = models.Count > 0 ? models[0].Id : null;
    Log("models.list", models.Count > 0, $"count={models.Count} first={firstModel ?? "?"}");
}
catch (Exception ex) { Log("models.list", false, ex.Message); }

// 3) Chat (non-stream)
var sessionKey = $"sdk-smoke-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
try
{
    var resp = await client.Chat.CreateAsync(new ChatCreateParams
    {
        SessionKey = sessionKey,
        Message = "Reply with exactly one word: pong.",
        Model = firstModel,
    });
    var text = (resp.Message ?? "").Trim();
    Log("chat.create (non-stream)", text.Length > 0, $"\"{Truncate(text, 60)}\"");
}
catch (Exception ex) { Log("chat.create (non-stream)", false, ex.Message); }

// 4) Chat stream
try
{
    var sb = new StringBuilder();
    int deltas = 0;
    await foreach (var d in client.Chat.StreamTextAsync(new ChatCreateParams
    {
        SessionKey = $"{sessionKey}-stream",
        Message = "Count from one to five, space separated.",
        Model = firstModel,
    }))
    {
        deltas++;
        sb.Append(d);
    }
    var text = sb.ToString().Trim();
    Log("chat.stream", deltas > 0 && text.Length > 0, $"deltas={deltas} text=\"{Truncate(text, 60)}\"");
}
catch (Exception ex) { Log("chat.stream", false, ex.Message); }

// 5) Auth error
try
{
    using var bad = new WingmanClient(new WingmanClientOptions
    {
        ApiKey = "wm_obviously_invalid_key",
        BaseUrl = baseUrl!,
    });
    await bad.Models.ListAsync();
    Log("error.auth", false, "expected 401 but request succeeded");
}
catch (AuthenticationException ex) { Log("error.auth", true, $"AuthenticationException status={ex.Status}"); }
catch (APIException ex) { Log("error.auth", ex.Status == 401, $"{ex.GetType().Name} status={ex.Status}"); }
catch (Exception ex) { Log("error.auth", false, ex.Message); }

Console.WriteLine(failures == 0 ? "\nAll smoke tests passed." : $"\n{failures} smoke test(s) failed.");
return failures == 0 ? 0 : 1;

static string Truncate(string s, int n) => s.Length <= n ? s : s[..n];
static string? Env(string name) =>
    string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(name))
        ? null
        : Environment.GetEnvironmentVariable(name);

static void LoadDotEnv()
{
    var dir = AppContext.BaseDirectory;
    for (int i = 0; i < 8 && dir is not null; i++)
    {
        var candidate = Path.Combine(dir, ".env");
        if (File.Exists(candidate))
        {
            foreach (var raw in File.ReadAllLines(candidate))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line.StartsWith('#')) continue;
                var eq = line.IndexOf('=');
                if (eq <= 0) continue;
                var k = line[..eq].Trim();
                var v = line[(eq + 1)..].Trim();
                if (v.Length >= 2 && ((v[0] == '"' && v[^1] == '"') || (v[0] == '\'' && v[^1] == '\'')))
                    v = v[1..^1];
                if (Environment.GetEnvironmentVariable(k) is null)
                    Environment.SetEnvironmentVariable(k, v);
            }
            return;
        }
        dir = Path.GetDirectoryName(dir);
    }
}
