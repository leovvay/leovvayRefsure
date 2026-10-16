/** `--help` or `-h` anywhere in the arguments: print the usage on stdout and exit 0, before any file, key or repo is read. */
export function helpExit(usage: string, argv: readonly string[] = process.argv.slice(2)): void {
  if (!argv.includes('--help') && !argv.includes('-h')) return;
  process.stdout.write(`${usage}\n`);
  process.exit(0);
}
