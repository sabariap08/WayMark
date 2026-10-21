"""Provider adapter for AI services.

No third-party SDKs, no hardcoded keys. Supports OpenAI-style and gracefully
returns None on any failure so callers fall back to local deterministic generator.
"""
import json
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from config import Config


def is_configured() -> bool:
    key = getattr(Config, "AI_API_KEY", "") or ""
    provider = getattr(Config, "AI_PROVIDER", "local") or "local"
    if not key:
        return False
    if provider == "local":
        return False
    return True


def name() -> str:
    return getattr(Config, "AI_PROVIDER", "local") or "local"


def model() -> str:
    return getattr(Config, "AI_MODEL", "") or ""


def _get_api_base() -> str:
    base = getattr(Config, "AI_API_BASE", None) or "https://api.openai.com/v1/chat/completions"
    return base


def complete_json(system_prompt: str, user_prompt: str, schema_hint: Optional[str] = None) -> Optional[Dict[str, Any]]:
    try:
        provider = name().lower()
        if not is_configured():
            return None
        if provider not in ("openai", "openai-compatible", "anthropic", "gemini"):
            return None

        headers = {
            "Content-Type": "application/json",
        }
        key = getattr(Config, "AI_API_KEY", "")
        if key:
            headers["Authorization"] = f"Bearer {key}"

        payload: Dict[str, Any] = {}

        if provider in ("openai", "openai-compatible"):
            msgs = []
            if system_prompt:
                msgs.append({"role": "system", "content": system_prompt})
            content = user_prompt
            if schema_hint:
                content = content + "\n\nSchema hint:\n" + schema_hint
            msgs.append({"role": "user", "content": content})
            payload = {
                "model": model() or "gpt-4o-mini",
                "messages": msgs,
                "temperature": 0.2,
                "max_tokens": 2048,
                "response_format": {"type": "json_object"},
            }
            url = _get_api_base()
        elif provider == "anthropic":
            # try minimal compatible shape if base points to compatible endpoint; else return None
            msgs = []
            if user_prompt:
                msgs.append({"role": "user", "content": user_prompt})
            payload = {
                "model": model() or "claude-3-haiku-20240307",
                "messages": msgs,
                "system": system_prompt,
                "max_tokens": 2048,
                "temperature": 0.2,
            }
            url = _get_api_base()
        elif provider == "gemini":
            url = _get_api_base()
            payload = {
                "contents": [
                    {"role": "user", "parts": [{"text": (system_prompt + "\n\n" + user_prompt)[:8000]}]}
                ],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
            }
        else:
            return None

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
        resp_data = json.loads(body)

        # extract JSON content
        if provider in ("openai", "openai-compatible"):
            choices = resp_data.get("choices") or []
            if choices:
                msg = choices[0].get("message") or {}
                cont = msg.get("content")
                if isinstance(cont, str):
                    try:
                        return json.loads(cont)
                    except Exception:
                        pass
        elif provider == "anthropic":
            content = resp_data.get("content") or []
            if content:
                c0 = content[0]
                if isinstance(c0, dict) and c0.get("type") == "thought":
                    # skip
                    pass
                if isinstance(c0, dict) and "text" in c0:
                    try:
                        return json.loads(c0["text"])
                    except Exception:
                        pass
        elif provider == "gemini":
            candidates = resp_data.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts and "text" in parts[0]:
                    try:
                        return json.loads(parts[0]["text"])
                    except Exception:
                        pass
        return None
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return None
    except Exception:
        return None
