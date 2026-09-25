/** Who may embed VCut in an `<iframe>`.
 *
 *  The hosted deployment (vcut.io) must never be framed: an embeddable editor that holds a user's session is a
 *  clickjacking target, so it sends `frame-ancestors 'none'` + `X-Frame-Options: DENY`.
 *
 *  The local / desktop / dev build is different: BP Studio embeds it (`studios/bp/app/projects/[id]/create`
 *  loads `<iframe src="<vcut>/edit?...">`), and both run on the user's own machine on loopback ports (3001 /
 *  3002 in dev, dynamically chosen ports in the packaged desktop app). The blanket DENY made that embed fail
 *  everywhere. So off the hosted deployment, framing is allowed from loopback origins only — a page on the open
 *  internet still can't frame it. `X-Frame-Options` can't express an allowlist, so it is omitted there and the
 *  CSP `frame-ancestors` carries the policy (every current browser honours it over XFO). */
export function framePolicy(hosted: boolean): { frameAncestors: string; xFrameOptions: string | null } {
  if (hosted) return { frameAncestors: "'none'", xFrameOptions: "DENY" };
  return { frameAncestors: "'self' http://localhost:* http://127.0.0.1:*", xFrameOptions: null };
}
