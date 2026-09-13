import { avatarColor, avatarInitial } from "./hostedClient";

/** The generated colored-initial avatar every creator gets (Phase 3) — no upload feature at all, see
 *  `avatarColor`'s own doc comment for why. `seed` is the creator's own user id (stable across a
 *  changed display name), `displayName` only picks WHICH letter shows. */
export function Avatar({ seed, displayName, size = 28 }: { seed: string; displayName: string | null | undefined; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: avatarColor(seed), fontSize: size * 0.45 }}
    >
      {avatarInitial(displayName)}
    </span>
  );
}
