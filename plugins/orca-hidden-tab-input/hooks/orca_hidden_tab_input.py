"""PreToolUse hook for Claude Code and Codex: paint a hidden Orca browser page before an agent sends it input.

Orca parks browser tabs that are off screen with display:none. A document that loads while its tab is parked
never paints, and Chromium then drops clicks and keys sent to it while Orca still answers ok. Before an `orca`
command that sends input, this hook asks the target page whether it has painted. If it has not, the hook takes
one screenshot: Orca paints the page for the capture without showing it, and the input that follows lands.

The hook never blocks a command, never changes it and prints nothing. Every failure only skips the preparation.
Off for a session: ORCA_HIDDEN_TAB_INPUT=off. Debug log: ORCA_HIDDEN_TAB_INPUT_LOG=<file>.
"""
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time

# Commands that a never-painted page drops (click, dblclick, type, inserttext, keypress, select-all, mouse ...),
# delays by about 5 s (hover, check, uncheck) or hangs the tab on (drag, mouse wheel, download). Measured on Orca
# 1.4.230; see README.
INPUT_VERBS = {'click', 'dblclick', 'hover', 'check', 'uncheck', 'type', 'inserttext', 'keypress', 'select-all',
               'mouse', 'drag', 'find', 'download', 'exec'}
BOOL_FLAGS = {'json', 'help', 'focus', 'wait', 'all', 'force', 'yes', 'mobile', 'show-profile'}
# Words that may precede a command without being it.
PREFIXES = {'if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '}', 'time', 'command', 'builtin',
            'exec', 'nohup', 'sudo', 'xargs', 'timeout', 'env', 'export'}
PUNCT = set(';&|()')
ASSIGN = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)$', re.S)
VAR = re.compile(r'\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))')
UNKNOWN = '$?'  # a flag present without a value the hook can know
HEREDOC = re.compile(r'<<-?\s*([\'"]?)([A-Za-z_][A-Za-z0-9_]*)\1')
# Paint entries plus the document's time origin, which tells one document from the next in the same tab.
PROBE = "performance.getEntriesByType('paint').length+' '+performance.timeOrigin"
MAX_TARGETS = 3
BUDGET_S = 7.0
STATE_DIR = os.path.join(tempfile.gettempdir(), 'orca-hidden-tab-input')


def log(msg):
    path = os.environ.get('ORCA_HIDDEN_TAB_INPUT_LOG')
    if path:
        try:
            with open(path, 'a') as fh:
                fh.write('%s\t%s\n' % (time.strftime('%H:%M:%S'), msg))
        except OSError:
            pass


# ── Reading the shell command ──

def normalize(command):
    """Drop heredoc bodies and comments, join line continuations, and turn newlines and backticks into separators."""
    kept, lines, i = [], command.split('\n'), 0
    while i < len(lines):
        kept.append(lines[i])
        m = HEREDOC.search(lines[i])
        i += 1
        if m:
            while i < len(lines) and lines[i].strip() != m.group(2):
                i += 1
            i += 1
    s, out, quote, j = '\n'.join(kept), [], None, 0
    while j < len(s):
        c = s[j]
        if quote:
            if c == '\\' and quote == '"' and j + 1 < len(s):
                out.append(s[j:j + 2])
                j += 2
                continue
            if c == quote:
                quote = None
            out.append(c)
        elif c == '\\' and j + 1 < len(s):
            out.append(' ' if s[j + 1] == '\n' else s[j:j + 2])
            j += 2
            continue
        elif c in '\'"':
            quote = c
            out.append(c)
        elif c == '#' and (j == 0 or s[j - 1] in ' \t\n;&|('):
            while j < len(s) and s[j] != '\n':
                j += 1
            continue
        elif c in '\n`':
            out.append(' ; ')
        else:
            out.append(c)
        j += 1
    return ''.join(out)


def strip_prefixes(words, env):
    """Remove leading assignments, keywords and wrappers (timeout 20, xargs -I{}, env, sudo) from a simple command."""
    while words:
        m = ASSIGN.match(words[0])
        if m:
            env[m.group(1)] = m.group(2)
            words = words[1:]
            continue
        word = words[0]
        if word not in PREFIXES:
            break
        words = words[1:]
        if word == 'timeout':
            while words and words[0].startswith('-'):
                words = words[1:]
            words = words[1:]
        elif word == 'xargs':
            while words and words[0].startswith('-'):
                words = words[2:] if words[0] in ('-I', '-n', '-P', '-L', '-d', '-s', '-E') else words[1:]
        elif word in ('sudo', 'env'):
            while words and words[0].startswith('-'):
                words = words[1:]
    return words


def verb_of(words):
    i = 1
    while i < len(words):
        word = words[i]
        if not word.startswith('--'):
            return word
        i += 1 if ('=' in word or word[2:] in BOOL_FLAGS) else 2
    return ''


def flag(words, name):
    """The flag's value; UNKNOWN when the flag is there without one (a backtick value lands here as a separator)."""
    value = None
    for i, word in enumerate(words):
        if word == '--' + name:
            has = i + 1 < len(words) and not words[i + 1].startswith('--')
            value = words[i + 1] if has else UNKNOWN
        elif word.startswith('--' + name + '='):
            value = word.split('=', 1)[1] or UNKNOWN
    return value


def targets(command, cwd='', depth=0):
    """(cli, page, worktree, cwd) for each `orca <input verb>` in a shell command, in order, at most MAX_TARGETS.

    Values the hook cannot know before the command runs ($(...), backticks, unset $VARs, the working directory after
    pushd or `cd $X`) are skipped, never guessed. `cwd` None means unknown.
    """
    lex = shlex.shlex(normalize(command), posix=True, punctuation_chars=';&|()')
    lex.whitespace_split = True
    lex.commenters = ''
    try:
        tokens = list(lex)
    except ValueError:
        return []
    found, env, words, outer = [], {}, [], []
    expand = lambda m: env.get(m.group(1) or m.group(2), m.group(0))
    for tok in tokens + [';']:
        if not (tok and set(tok) <= PUNCT):
            words.append(VAR.sub(expand, tok))
            continue
        cmd, words = strip_prefixes(words, env), []
        if cmd:
            found += [t for t in command_targets(cmd, cwd, depth) if t not in found]
            cwd = cwd_after(cmd, cwd)
        for c in tok:  # a cd inside a subshell ends with it
            if c == '(':
                outer.append(cwd)
            elif c == ')' and outer:
                cwd = outer.pop()
    return found[:MAX_TARGETS]


def cwd_after(cmd, cwd):
    name = os.path.basename(cmd[0])
    if name == 'cd':
        if len(cmd) == 2 and '$' not in cmd[1] and cmd[1] != '-' and cwd is not None:
            return os.path.normpath(os.path.join(cwd or '/', os.path.expanduser(cmd[1])))
        return None
    return None if name in ('pushd', 'popd') else cwd


def command_targets(cmd, cwd, depth):
    name = os.path.basename(cmd[0])
    if name in ('bash', 'sh', 'zsh') and len(cmd) >= 3 and re.fullmatch(r'-[a-z]*c[a-z]*', cmd[1]) and depth < 2:
        return targets(cmd[2], cwd, depth + 1)
    if name != 'orca' or verb_of(cmd) not in INPUT_VERBS:
        return []
    page, worktree = flag(cmd, 'page') or '', flag(cmd, 'worktree') or ''
    # Without --page, Orca picks the current tab of the working directory's worktree: only a known one will do.
    if '$' in page + worktree or (not page and cwd is None):
        return []
    return [(cmd[0], page, worktree, cwd or '')]


# ── Preparing the page ──

BUNDLED_CLI = '/Applications/Orca.app/Contents/Resources/bin/orca'


def resolve_cli(name, cwd):
    """The Orca CLI to run, or None. Hooks run before the user approves the command, so the hook runs only the
    `orca` on its own PATH or the one inside Orca.app, never a file the command names by path."""
    trusted = [c for c in (shutil.which('orca'), BUNDLED_CLI) if c and os.access(c, os.X_OK)]
    if not trusted:
        return None
    if '/' not in name:
        return trusted[0]
    named = os.path.realpath(os.path.join(cwd or os.getcwd(), os.path.expanduser(name)))
    return next((c for c in trusted if os.path.realpath(c) == named), None)


class Painted:
    """Documents this hook already painted, so a page that still shows 0 paint entries afterwards (seen once, cause
    unknown) costs one screenshot, not one per command."""

    def __init__(self):
        self.path = os.path.join(STATE_DIR, 'painted')
        self.keys = []
        try:
            os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
            st = os.lstat(STATE_DIR)
            # Use the directory only if it is ours: a shared /tmp could hold someone else's directory or a symlink.
            self.usable = st.st_uid == os.getuid() and not os.path.islink(STATE_DIR) and (st.st_mode & 0o077) == 0
            if self.usable:
                with open(self.path) as fh:
                    self.keys = fh.read().splitlines()
        except OSError:
            self.usable = getattr(self, 'usable', False)

    def __contains__(self, key):
        return key in self.keys

    def add(self, key):
        # Concurrent hooks may drop each other's keys; that costs at most one extra screenshot.
        self.keys = (self.keys + [key])[-200:]
        if not self.usable:
            return
        try:
            fd, tmp = tempfile.mkstemp(dir=STATE_DIR)
            with os.fdopen(fd, 'w') as fh:
                fh.write('\n'.join(self.keys) + '\n')
            os.replace(tmp, self.path)
        except OSError:
            pass


def prepare(cli, page, worktree, cwd, deadline, painted):
    selector = (['--page', page] if page else []) + (['--worktree', worktree] if worktree else [])
    run_cwd = cwd if cwd and os.path.isdir(cwd) else None

    def call(args, timeout):
        """(ok, result) of one CLI call; ok is False on an error answer, a timeout or a spent budget."""
        left = deadline - time.time()
        if left <= 0.2:
            return False, None
        try:
            r = subprocess.run([cli] + args + selector + ['--json'], capture_output=True, text=True,
                               stdin=subprocess.DEVNULL, cwd=run_cwd, timeout=min(timeout, left))
            out = json.loads(r.stdout)
            res = out.get('result')
            return r.returncode == 0 and out.get('ok') is True, res.get('result') if isinstance(res, dict) else res
        except (OSError, ValueError, AttributeError, subprocess.SubprocessError):
            return False, None

    _, probe = call(['eval', '--expression', PROBE], 4)
    paints, _, origin = str(probe).strip().partition(' ')
    key = '%s@%s' % (page or worktree or cwd or '-', origin)
    if paints != '0' or not origin or key in painted:
        log('page=%s worktree=%s paints=%s' % (page or '(active)', worktree or '(cwd)', paints if probe else '?'))
        return
    shot_dir = tempfile.mkdtemp(prefix='orca-hidden-tab-input-')
    try:
        # A screenshot is the one Orca command that paints a parked page without showing it. Through `exec` the
        # file goes to a path this hook owns and deletes; `orca screenshot` would leave a copy in agent-browser's
        # temp directory.
        ok, _ = call(['exec', '--command', shlex.join(['screenshot', os.path.join(shot_dir, 'paint.jpg'),
                                                       '--screenshot-format', 'jpeg', '--screenshot-quality', '1'])], 5)
    finally:
        shutil.rmtree(shot_dir, ignore_errors=True)
    if ok:
        painted.add(key)
    log('page=%s worktree=%s paints=0 -> %s' % (page or '(active)', worktree or '(cwd)', 'painted' if ok else 'paint failed'))


def main():
    if os.environ.get('ORCA_HIDDEN_TAB_INPUT', '').strip().lower() == 'off' or sys.platform != 'darwin':
        return
    data = json.load(sys.stdin)
    if data.get('hook_event_name') != 'PreToolUse':
        return
    tool_input = data.get('tool_input')
    command = tool_input.get('command') if isinstance(tool_input, dict) else None
    if isinstance(command, list):
        command = shlex.join(str(c) for c in command)
    if not isinstance(command, str) or 'orca' not in command:
        return
    deadline, painted = time.time() + BUDGET_S, Painted()
    for name, page, worktree, cwd in targets(command, data.get('cwd') or ''):
        cli = resolve_cli(name, cwd)
        if cli:
            prepare(cli, page, worktree, cwd, deadline, painted)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:  # A hook must never break the agent's command.
        log('error %r' % exc)
