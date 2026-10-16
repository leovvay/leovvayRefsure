#!/bin/sh
# Release scrub gate. It refuses a release that contains strings the maintainer listed as private.
#
# Patterns are never committed. One extended regex per line, read from $REFSURE_SCRUB_PATTERNS (newline-separated)
# or ~/.config/refsure-scrub/patterns. An optional allowlist of literal strings, removed from the scanned text before
# matching, comes from $REFSURE_SCRUB_ALLOW or ~/.config/refsure-scrub/allow.
#
# Scans, case-insensitively: every `git ls-files` path and file (untracked, non-ignored files included), the
# unpacked `npm pack` tarball (paths and files), and `git log --all --format='%an %ae %cn %ce %B'`.
#
# Prints only `<source>:<file>:<line>: pattern #<n>`, never the matched text or the pattern. A file whose own path
# matches is shown as `#<index>` in its listing. Exit 0 clean, 1 on any hit, 2 when it cannot run.
set -eu

LC_ALL=C
export LC_ALL

conf_dir="${HOME}/.config/refsure-scrub"

fail() {
  printf 'scrub: %s\n' "$1" >&2
  exit 2
}

tmp=$(mktemp -d "${TMPDIR:-/tmp}/refsure-scrub.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# --- inputs -------------------------------------------------------------------------------------------------------

if [ -n "${REFSURE_SCRUB_PATTERNS:-}" ]; then
  printf '%s\n' "$REFSURE_SCRUB_PATTERNS" > "$tmp/patterns.all"
elif [ -f "$conf_dir/patterns" ]; then
  cat "$conf_dir/patterns" > "$tmp/patterns.all"
else
  fail 'no scrub patterns configured'
fi

if [ -n "${REFSURE_SCRUB_ALLOW:-}" ]; then
  printf '%s\n' "$REFSURE_SCRUB_ALLOW" > "$tmp/allow.raw"
elif [ -f "$conf_dir/allow" ]; then
  cat "$conf_dir/allow" > "$tmp/allow.raw"
else
  : > "$tmp/allow.raw"
fi

# Strip CRs; drop blank lines from the allowlist. Pattern numbers follow the source lines, blanks included.
tr -d '\r' < "$tmp/patterns.all" > "$tmp/patterns.lf" && mv "$tmp/patterns.lf" "$tmp/patterns.all"
tr -d '\r' < "$tmp/allow.raw" | grep -v '^[[:space:]]*$' > "$tmp/allow" || :
grep -v '^[[:space:]]*$' "$tmp/patterns.all" > "$tmp/patterns.re" || :
[ -s "$tmp/patterns.re" ] || fail 'no scrub patterns configured'

n=0
while IFS= read -r pat || [ -n "$pat" ]; do
  n=$((n + 1))
  case $pat in *[![:space:]]*) ;; *) continue ;; esac
  rc=0
  printf 'x\n' | grep -iE -e "$pat" > /dev/null 2>&1 || rc=$?
  [ "$rc" -le 1 ] || fail "pattern #$n is not a valid extended regex"
done < "$tmp/patterns.all"

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir/../.."
git rev-parse --is-inside-work-tree > /dev/null 2>&1 || fail 'not inside a git work tree'

: > "$tmp/hits"

# --- matching -----------------------------------------------------------------------------------------------------

# Removes every allowlisted literal from stdin, by index, so no literal is ever read as a regex.
allow_awk='
BEGIN { n = 0; while ((getline line < allowfile) > 0) a[++n] = line }
{
  s = $0
  for (k = 1; k <= n; k++) {
    out = ""; len = length(a[k])
    while ((i = index(s, a[k])) > 0) { out = out substr(s, 1, i - 1); s = substr(s, i + len) }
    s = out s
  }
  print s
}'

clean() {
  if [ -s "$tmp/allow" ]; then
    awk -v allowfile="$tmp/allow" "$allow_awk"
  else
    cat
  fi
}

# scan_file <source> <display> <file>: records `<source>:<display>:<line>: pattern #<n>` for every hit.
scan_file() {
  clean < "$3" > "$tmp/cur"
  grep -aiqE -f "$tmp/patterns.re" "$tmp/cur" || return 0
  n=0
  while IFS= read -r pat || [ -n "$pat" ]; do
    n=$((n + 1))
    case $pat in *[![:space:]]*) ;; *) continue ;; esac
    grep -aniE -e "$pat" "$tmp/cur" | cut -d: -f1 | while IFS= read -r line; do
      printf '%s:%s:%s: pattern #%s\n' "$1" "$2" "$line" "$n"
    done >> "$tmp/hits"
  done < "$tmp/patterns.all"
}

# display_name <path> <index>: the path itself, or `#<index>` when the path would leak a match.
display_name() {
  if printf '%s\n' "$1" | clean | grep -aiqE -f "$tmp/patterns.re"; then
    printf '#%s' "$2"
  else
    printf '%s' "$1"
  fi
}

# scan_listing <source> <root> <listing>: every regular file named in the listing, relative to root.
scan_listing() {
  idx=0
  while IFS= read -r f || [ -n "$f" ]; do
    idx=$((idx + 1))
    [ -f "$2/$f" ] && [ ! -L "$2/$f" ] || continue
    scan_file "$1" "$(display_name "$f" "$idx")" "$2/$f"
  done < "$3"
}

# --- 1. repo paths and files -------------------------------------------------------------------------------------

# Tracked files, plus untracked ones that are not ignored, so a local run also catches what is about to be committed.
git -c core.quotePath=false ls-files --cached --others --exclude-standard > "$tmp/repo-paths"
scan_file 'repo-paths' 'git-ls-files' "$tmp/repo-paths"
scan_listing 'repo' "$(pwd)" "$tmp/repo-paths"

# --- 2. the npm tarball -------------------------------------------------------------------------------------------

mkdir "$tmp/pack" "$tmp/unpacked"
# Under `prepublishOnly`, npm hands its own flags down as npm_config_* variables, and `npm publish --dry-run` would
# make this pack write no tarball, so the flag is turned off here.
npm pack --dry-run=false --pack-destination "$tmp/pack" > "$tmp/pack.log" 2>&1 ||
  fail 'npm pack failed; run it by hand to see why'
tarball=$(find "$tmp/pack" -name '*.tgz' -type f | head -n 1)
[ -n "$tarball" ] || fail 'npm pack produced no tarball'
tar -xzf "$tarball" -C "$tmp/unpacked"
(cd "$tmp/unpacked" && find . -type f | sed 's|^\./||' | sort) > "$tmp/pack-paths"
scan_file 'pack-paths' 'npm-pack' "$tmp/pack-paths"
scan_listing 'pack' "$tmp/unpacked" "$tmp/pack-paths"

# --- 3. history ---------------------------------------------------------------------------------------------------

git log --all --format='%an %ae %cn %ce %B' > "$tmp/log"
scan_file 'git-log' 'all' "$tmp/log"

# --- verdict ------------------------------------------------------------------------------------------------------

files=$(wc -l < "$tmp/repo-paths" | tr -d ' ')
packed=$(wc -l < "$tmp/pack-paths" | tr -d ' ')
hits=$(wc -l < "$tmp/hits" | tr -d ' ')
if [ "$hits" -gt 0 ]; then
  cat "$tmp/hits"
  printf 'scrub: %s hit(s) in %s repo files, %s packed files and the git log\n' "$hits" "$files" "$packed" >&2
  exit 1
fi
printf 'scrub: clean (%s repo files, %s packed files, git log)\n' "$files" "$packed" >&2
