#!/usr/bin/env bash
# PreToolUse hook entry point for Claude Code and Codex. See orca_hidden_tab_input.py and the README.
# A payload without the word `orca` followed by a space, a tab or a quote (paths such as ~/orca/workspaces do not
# count) leaves here without starting Python. The hook never fails a command: whatever goes wrong, it exits 0 with
# no output.
input=$(cat)
case $input in
  *'orca '* | *'orca\t'* | *'orca"'* | *'orca\"'* | *"orca'"*) ;;
  *) exit 0 ;;
esac
case ${ORCA_HIDDEN_TAB_INPUT:-} in
  off | OFF | Off) exit 0 ;;
esac
[ "$(uname -s)" = Darwin ] || exit 0
py=$(command -v python3) || exit 0
# Without the Command Line Tools, /usr/bin/python3 is a stub that opens an install dialog.
if [ "$py" = /usr/bin/python3 ] && ! xcode-select -p >/dev/null 2>&1; then
  exit 0
fi
# Find the .py next to the real file, also when this script is reached through a symlink.
src=$0
while [ -h "$src" ]; do
  link=$(readlink "$src")
  case $link in
    /*) src=$link ;;
    *) src=$(dirname "$src")/$link ;;
  esac
done
{ printf '%s' "$input" | "$py" -I "$(dirname "$src")/orca_hidden_tab_input.py"; } >/dev/null 2>&1
exit 0
