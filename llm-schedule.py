#!/usr/bin/env python3
"""Schedule a command to run in a future Claude session via `at`.

The current Claude usage window is 5 hours long, starting with the first
message of the session. This script finds when the current window began
(by scanning Claude Code's JSONL transcripts), then schedules the given
command to run 1 minute into the Nth session from now (default: next).
"""

import argparse
import json
import os
import shlex
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SESSION_DURATION = timedelta(hours=5)


def find_current_session_start(config_dir: Path) -> datetime:
    """Return the earliest message timestamp within the last 5 hours."""
    projects_dir = config_dir / "projects"
    if not projects_dir.is_dir():
        sys.exit(f"No projects directory at {projects_dir}")

    now = datetime.now(timezone.utc)
    cutoff = now - SESSION_DURATION
    earliest: datetime | None = None

    for jsonl in projects_dir.rglob("*.jsonl"):
        try:
            mtime = datetime.fromtimestamp(jsonl.stat().st_mtime, tz=timezone.utc)
        except OSError:
            continue
        if mtime < cutoff:
            continue
        try:
            with jsonl.open("r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    ts = entry.get("timestamp")
                    if not isinstance(ts, str):
                        continue
                    try:
                        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    except ValueError:
                        continue
                    if dt >= cutoff and (earliest is None or dt < earliest):
                        earliest = dt
        except OSError:
            continue

    if earliest is None:
        sys.exit("No Claude activity found in the last 5 hours.")
    return earliest


def schedule_at(run_at: datetime, command: str, config_dir: Path) -> None:
    local = run_at.astimezone()
    at_time = local.strftime("%H:%M %Y-%m-%d")
    script = f"export CLAUDE_CONFIG_DIR={shlex.quote(str(config_dir))}\n{command}\n"
    proc = subprocess.run(
        ["at", at_time],
        input=script,
        text=True,
        capture_output=True,
    )
    if proc.stderr:
        sys.stderr.write(proc.stderr)
    if proc.returncode != 0:
        sys.exit(proc.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Schedule a command for a future Claude session using `at`.",
    )
    parser.add_argument(
        "-n", "--sessions",
        type=int, default=1,
        help="Sessions from now (1 = next session, default).",
    )
    parser.add_argument(
        "-s", "--start-in",
        type=float,
        help="Minutes from now until the next session starts. "
             "Overrides the session start time inferred from transcripts.",
    )
    parser.add_argument(
        "--config-dir",
        help="Claude config dir (overrides $CLAUDE_CONFIG_DIR).",
    )
    parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Command to run. Use -- before flags meant for the command.",
    )
    args = parser.parse_args()

    cmd = args.command
    if cmd and cmd[0] == "--":
        cmd = cmd[1:]
    if not cmd:
        parser.error("no command provided")
    if args.sessions < 1:
        parser.error("--sessions must be >= 1")

    config_dir = Path(
        args.config_dir
        or os.environ.get("CLAUDE_CONFIG_DIR")
        or (Path.home() / ".claude")
    ).expanduser()

    if args.start_in is not None:
        next_session_start = datetime.now(timezone.utc) + timedelta(minutes=args.start_in)
        run_at = next_session_start + (args.sessions - 1) * SESSION_DURATION + timedelta(minutes=1)
        session_start = None
        current_end = next_session_start
    else:
        session_start = find_current_session_start(config_dir)
        current_end = session_start + SESSION_DURATION
        run_at = current_end + (args.sessions - 1) * SESSION_DURATION + timedelta(minutes=1)

    command_str = shlex.join(cmd)

    print(f"Config dir:       {config_dir}")
    if session_start is not None:
        print(f"Session started:  {session_start.astimezone().isoformat()}")
        print(f"Current ends:     {current_end.astimezone().isoformat()}")
    else:
        print(f"Next session at:  {current_end.astimezone().isoformat()}  (from --start-in)")
    print(f"Scheduling for:   {run_at.astimezone().isoformat()}  (session +{args.sessions})")
    print(f"Command:          {command_str}")

    schedule_at(run_at, command_str, config_dir)


if __name__ == "__main__":
    main()
