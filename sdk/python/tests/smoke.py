"""Smoke test for the Wingman Python SDK against a live proxy.

Reads WINGMAN_API_KEY and WINGMAN_BASE_URL from the repo-root .env file
(or the process environment if already set). Both are required.
"""

from __future__ import annotations

import os
import sys
import time

# Allow running directly without installing the package.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from wingman import Wingman, AuthenticationError  # noqa: E402

failures = 0


def load_dotenv(path: str) -> None:
    try:
        with open(path, "r", encoding="utf-8") as fp:
            for raw_line in fp:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                if (value.startswith('"') and value.endswith('"')) or (
                    value.startswith("'") and value.endswith("'")
                ):
                    value = value[1:-1]
                os.environ.setdefault(key, value)
    except FileNotFoundError:
        pass


def log(label: str, ok: bool, info: str = "") -> None:
    global failures
    tag = "PASS" if ok else "FAIL"
    if not ok:
        failures += 1
    suffix = f" — {info}" if info else ""
    print(f"[{tag}] {label}{suffix}")


def main() -> int:
    repo_root = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
    load_dotenv(os.path.join(repo_root, ".env"))

    api_key = os.environ.get("WINGMAN_API_KEY") or os.environ.get("API_PROD_TESTING_KEY_01")
    base_url = os.environ.get("WINGMAN_BASE_URL") or os.environ.get("PROD_URL")
    if not api_key:
        print("Set WINGMAN_API_KEY (or API_PROD_TESTING_KEY_01 in .env) before running the smoke test.")
        return 2
    if not base_url:
        print("Set WINGMAN_BASE_URL (or PROD_URL in .env) before running the smoke test.")
        return 2

    client = Wingman(api_key=api_key, base_url=base_url)

    # 1) Health
    try:
        h = client.health.check()
        log("health.check", isinstance(h.get("status"), str), f"status={h.get('status')}")
    except Exception as exc:  # noqa: BLE001
        log("health.check", False, str(exc))

    # 2) Models
    first_model = os.environ.get("WINGMAN_MODEL")
    try:
        models = client.models.list()
        if not first_model and models:
            first_model = models[0].get("id")
        log(
            "models.list",
            len(models) > 0,
            f"count={len(models)} first={first_model or '?'}",
        )
    except Exception as exc:  # noqa: BLE001
        log("models.list", False, str(exc))

    # 3) Chat (non-streaming)
    session_key = f"sdk-py-smoke-{int(time.time() * 1000)}"
    try:
        resp = client.chat.create(
            session_key=session_key,
            message="Reply with exactly one word: pong.",
            model=first_model,
        )
        text = (resp.message or "").strip()
        log("chat.create (non-stream)", len(text) > 0, repr(text[:60]))
    except Exception as exc:  # noqa: BLE001
        log("chat.create (non-stream)", False, str(exc))

    # 4) Chat (streaming)
    try:
        deltas = 0
        collected = ""
        for delta in client.chat.stream_text(
            session_key=f"{session_key}-stream",
            message="Count from one to five, space separated.",
            model=first_model,
        ):
            deltas += 1
            collected += delta
        log(
            "chat.stream",
            deltas > 0 and len(collected) > 0,
            f"deltas={deltas} text={collected[:60]!r}",
        )
    except Exception as exc:  # noqa: BLE001
        log("chat.stream", False, str(exc))

    # 5) Error mapping — bad key
    try:
        bad = Wingman(api_key="wm_obviously_invalid_key", base_url=base_url)
        bad.models.list()
        log("error.auth", False, "expected 401 but request succeeded")
    except AuthenticationError as exc:
        log("error.auth", True, f"AuthenticationError status={exc.status}")
    except Exception as exc:  # noqa: BLE001
        log("error.auth", False, f"got {type(exc).__name__}: {exc}")

    client.close()
    print()
    if failures == 0:
        print("All smoke tests passed.")
        return 0
    print(f"{failures} smoke test(s) failed.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
