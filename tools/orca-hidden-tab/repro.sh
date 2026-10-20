#!/usr/bin/env bash
# Shows the problem and the fix in your own Orca, in about 20 s. Run it in an Orca terminal.
# It opens one browser tab in the current worktree, never switches to it, and closes it at the end.
set -u
if [ -z "${ORCA_WORKTREE_ID:-}" ]; then
  echo "Run this in an Orca terminal (ORCA_WORKTREE_ID is not set)." >&2
  exit 1
fi
here=$(cd "$(dirname "$0")" && pwd)
hook="$here/../../plugins/orca-hidden-tab-input/hooks/orca-hidden-tab-input.sh"
site=$(mktemp -d)
port=$((20000 + RANDOM % 20000))
printf '%s' '<!doctype html><title>repro</title><button onclick="window.hits=(window.hits||0)+1">Press</button>' > "$site/index.html"
python3 -m http.server "$port" --bind 127.0.0.1 -d "$site" >/dev/null 2>&1 &
server=$!
page=''
cleanup() {
  [ -n "$page" ] && orca tab close --page "$page" --json >/dev/null 2>&1
  kill "$server" 2>/dev/null
  wait "$server" 2>/dev/null
  rm -rf "$site"
}
trap cleanup EXIT
sleep 1

field() { python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]'"$1"')'; }
paints() { orca eval --page "$page" --expression "performance.getEntriesByType('paint').length" --json | field '["result"]'; }
hits() { orca eval --page "$page" --expression "String(window.hits||0)" --json | field '["result"]'; }
button() { orca snapshot --page "$page" --json | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]["refs"]; print("@"+next(k for k,v in r.items() if v.get("name")=="Press"))'; }
now() { python3 -c 'import time; print(time.time())'; }
click() {
  local ref start ok
  ref=$(button)
  start=$(now)
  ok=$(orca click --page "$page" --element "$ref" --json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))')
  python3 -c 'import sys; print("  orca answered ok=%s after %.1f s" % (sys.argv[1], float(sys.argv[3]) - float(sys.argv[2])))' "$ok" "$start" "$(now)"
  echo "  the page saw $(hits) click(s)"
}

# Without --worktree, Orca would put the tab in whichever worktree is on screen.
page=$(orca tab create --worktree "id:$ORCA_WORKTREE_ID" --url "http://127.0.0.1:$port/?first" --json | field '["browserPageId"]' 2>/dev/null)
if [ -z "$page" ]; then
  echo "orca tab create failed; nothing else was touched." >&2
  exit 1
fi
echo "Opened hidden tab $page. Waiting 12 s until Orca parks it..."
sleep 12
orca goto --page "$page" --url "http://127.0.0.1:$port/?loaded-while-hidden" --json >/dev/null
echo "Loaded a new page while the tab is hidden. Paint entries: $(paints)"
echo "1) Click without the hook:"
click
orca goto --page "$page" --url "http://127.0.0.1:$port/?again" --json >/dev/null
echo "2) Same again, with the hook run first. Paint entries before: $(paints)"
python3 -c 'import json,os,sys; print(json.dumps({"hook_event_name": "PreToolUse", "tool_name": "Bash", "cwd": os.getcwd(),
  "tool_input": {"command": "orca click --page %s --element @e1 --json" % sys.argv[1]}}))' "$page" |
  env -u ORCA_HIDDEN_TAB_INPUT bash "$hook"
echo "  hook done. Paint entries now: $(paints)"
click
