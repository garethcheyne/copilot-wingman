# wingman-sdk (Python)

Official Python SDK for the Wingman chat proxy.
Python 3.10+. Built on `httpx`.

## Install

```bash
pip install wingman-sdk
```

## Usage

### Non-streaming

```python
from wingman import Wingman

client = Wingman(api_key="wm_...")

res = client.chat.create(
    session_key="my-session-id",   # reuse to keep context across turns
    message="Hello, who are you?",
    model="claude-sonnet-4.6",      # optional
)
print(res.message)
```

### Streaming

```python
for delta in client.chat.stream_text(
    session_key="my-session-id",
    message="Count to ten.",
):
    print(delta, end="", flush=True)
```

Or use the low-level `Stream` for full chunk objects:

```python
with client.chat.stream(session_key="s", message="Hi") as stream:
    for chunk in stream:
        print(chunk["choices"][0]["delta"].get("content", ""), end="")
```

### List models / health

```python
client.models.list()    # [{"id": "claude-sonnet-4.6", ...}, ...]
client.health.check()   # {"status": "healthy"}
```

### Vision (images & PDFs)

Pass base64 data URLs in the `images` parameter. The server accepts both image
data URLs (`data:image/png;base64,...`) and PDF data URLs
(`data:application/pdf;base64,...`). PDFs are rendered server-side to per-page
PNG images automatically (max 5 pages per PDF).

```python
import base64
from pathlib import Path

# Send an image
img_b64 = base64.b64encode(Path("screenshot.png").read_bytes()).decode()
res = client.chat.create(
    session_key="vision-demo",
    message="What's in this image?",
    model="gpt-4o",
    images=[f"data:image/png;base64,{img_b64}"],
)

# Send a PDF (server renders pages to images)
pdf_b64 = base64.b64encode(Path("document.pdf").read_bytes()).decode()
res = client.chat.create(
    session_key="pdf-demo",
    message="Summarise this document.",
    model="gpt-4o",
    images=[f"data:application/pdf;base64,{pdf_b64}"],
)
```

### Errors

```python
from wingman import (
    APIError,
    AuthenticationError,
    RateLimitError,
)

try:
    client.chat.create(session_key="s", message="hi")
except AuthenticationError:
    print("Bad key")
except RateLimitError:
    print("Slow down")
except APIError as e:
    print(e.status, e)
```

Status-to-class map: `400 BadRequestError`, `401 AuthenticationError`,
`403 PermissionDeniedError`, `404 NotFoundError`, `409 ConflictError`,
`422 UnprocessableEntityError`, `429 RateLimitError`, `5xx InternalServerError`.
Network failures surface as `APIConnectionError` / `APIConnectionTimeoutError`.

## Client options

```python
Wingman(
    api_key="wm_...",                       # or WINGMAN_API_KEY env var
    base_url="https://wingman.example.com", # required (or WINGMAN_BASE_URL env var)
    timeout=60.0,                            # seconds per request
    max_retries=2,                           # retries 408/409/429/5xx + network
    default_headers={"X-Trace": "abc"},
)
```

`Wingman` supports `with` for cleanup:

```python
with Wingman(api_key="wm_...") as client:
    print(client.health.check())
```

## Smoke test

```bash
WINGMAN_API_KEY=wm_... python tests/smoke.py
```

## License

MIT
