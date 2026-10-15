/**
 * Whether `url` matches `glob` whole (spec §6.2): `*` is any run of characters, everything else is literal and
 * case-sensitive. Two pointers with one backtrack point, so a glob of many stars stays linear-ish on any URL;
 * a regex of `.*` runs could backtrack without bound.
 */
export function urlGlobMatches(glob: string, url: string): boolean {
  let g = 0;
  let u = 0;
  let star = -1;
  let resume = 0;
  while (u < url.length) {
    if (g < glob.length && glob[g] === '*') {
      star = g;
      g += 1;
      resume = u;
    } else if (g < glob.length && glob[g] === url[u]) {
      g += 1;
      u += 1;
    } else if (star !== -1) {
      g = star + 1;
      resume += 1;
      u = resume;
    } else {
      return false;
    }
  }
  while (g < glob.length && glob[g] === '*') g += 1;
  return g === glob.length;
}
