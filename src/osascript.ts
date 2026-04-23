export function shellEscapeArg(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
