#!/usr/bin/env python3
"""Configure a local-only OpenJarvis tool agent without storing secrets."""

from __future__ import annotations

import argparse
import datetime as dt
import shutil
from pathlib import Path

import tomlkit


CORE_TOOLS = [
    "think",
    "calculator",
]

READ_ONLY_BROWSER_TOOLS = [
    "web_search",
    "browser_navigate",
    "browser_screenshot",
    "browser_extract",
]

WORKSPACE_TOOLS = [
    "file_read",
    "retrieval",
]

HOST_CONTROL_TOOLS = [
    "shell_exec",
    "file_write",
    "apply_patch",
    "code_interpreter",
    "git_status",
    "git_diff",
    "git_commit",
]


def table(document: tomlkit.TOMLDocument, name: str):
    if name not in document or not hasattr(document[name], "items"):
        document[name] = tomlkit.table()
    return document[name]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=Path.home() / ".openjarvis" / "config.toml")
    parser.add_argument("--model", default="llama3.2:1b")
    parser.add_argument("--host-control", action="store_true", help="Enable unprivileged shell and writable-file tools inside allowed-dir")
    parser.add_argument("--allowed-dir", type=Path, default=Path.home())
    args = parser.parse_args()

    args.config.parent.mkdir(parents=True, exist_ok=True)
    if args.config.exists():
        original = args.config.read_text(encoding="utf-8")
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(args.config, args.config.with_suffix(f".toml.bak-{stamp}"))
        document = tomlkit.parse(original)
    else:
        document = tomlkit.document()

    engine = table(document, "engine")
    engine["default"] = "ollama"
    ollama = engine.get("ollama")
    if not hasattr(ollama, "items"):
        ollama = tomlkit.table()
        engine["ollama"] = ollama
    ollama["host"] = "http://127.0.0.1:11434"

    intelligence = table(document, "intelligence")
    intelligence["default_model"] = args.model
    intelligence["temperature"] = 0.25
    intelligence["max_tokens"] = 2048

    agent = table(document, "agent")
    agent["default_agent"] = "orchestrator"
    agent["max_turns"] = 12
    agent["context_from_memory"] = True

    tools = table(document, "tools")
    enabled = list(CORE_TOOLS)
    if args.host_control:
        enabled.extend(WORKSPACE_TOOLS)
        enabled.extend(HOST_CONTROL_TOOLS)
    else:
        enabled.extend(READ_ONLY_BROWSER_TOOLS)
    tools["enabled"] = enabled

    server = table(document, "server")
    server["host"] = "127.0.0.1"
    server["port"] = 8000
    server["agent"] = "orchestrator"
    server["model"] = args.model
    server["workers"] = 1

    security = table(document, "security")
    security["allowed_dirs"] = [str(args.allowed_dir.resolve())]

    table(document, "traces")["enabled"] = True
    table(document, "telemetry")["enabled"] = True
    table(document, "analytics")["enabled"] = False

    args.config.write_text(tomlkit.dumps(document), encoding="utf-8")
    args.config.chmod(0o600)
    mode = "browser plus unprivileged workspace control" if args.host_control else "browser and read-only workspace access"
    print(f"Configured OpenJarvis at {args.config} ({mode}).")
    print("Google OAuth credentials are not stored in this file.")


if __name__ == "__main__":
    main()
