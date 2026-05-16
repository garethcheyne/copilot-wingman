# wingman-sdk (Python) — planned

Status: **scaffold only.** The Python client is not yet implemented.

## Planned API

```python
from wingman import Wingman

client = Wingman(api_key="wm_...")

# Non-streaming
res = client.chat.create(
    session_key="my-session-id",
    message="Hello",
    model="claude-sonnet-4.6",
)
print(res.message)

# Streaming
with client.chat.stream(session_key="my-session-id", message="Count to ten") as s:
    for delta in s:
        print(delta, end="", flush=True)
    full = s.final_text()

client.health.check()        # {"status": "healthy"}
client.models.list()         # [{"id": "..."}]
```

## Planned package

- Name: `wingman-sdk`
- Python: 3.10+
- Sync + async clients (`Wingman`, `AsyncWingman`)
- `httpx` as the HTTP backend
- Error hierarchy mirroring the Node SDK
- Same default base URL: `https://wingman.err403.com`

See [`../node/`](../node/) for the reference implementation in TypeScript.
