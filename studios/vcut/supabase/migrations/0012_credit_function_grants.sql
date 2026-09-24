-- Locks down spend_credits/refund_credits to the server's own service-role connection.
--
-- Both functions are `security definer` (0003_credits.sql, 0004_credit_refunds.sql,
-- 0005_credit_allotment_increase.sql) so their body runs with the DEFINER's privileges against
-- `profiles`/`usage_events` regardless of the CALLER's own row-level-security grants — that's what
-- makes them work at all from a service-role connection, which otherwise has no policy of its own
-- letting it touch another user's row. But `security definer` only changes what the function's body
-- can see; it does nothing about who is allowed to CALL the function in the first place. Postgres
-- grants EXECUTE on a newly created function to the implicit `PUBLIC` pseudo-role by default, and
-- every real role (including `anon` and `authenticated`, the two Supabase hands to a browser holding
-- nothing but the public anon key) is always a member of `PUBLIC` — so unless something explicitly
-- revokes it, ANY signed-in user's own browser session can call
-- `supabase.rpc("refund_credits", { p_user_id: <anyone's id>, p_amount: <anything> })` directly
-- against PostgREST, crediting their own (or anyone else's) balance for free, no server route
-- involved at all. No earlier migration ever revoked this default — confirmed by grep across every
-- file in this directory. `_lib/credits.ts` is the ONLY real caller (`getSupabaseAdminClient()`,
-- the service-role client — see `packages/auth/src/server.ts`'s own doc comment on why only a
-- trusted server process ever holds that key), so revoking every OTHER role's ability to call these
-- costs the real call path nothing.
--
-- `revoke ... from public` also removes `anon`/`authenticated`'s own inherited access (they have no
-- SEPARATE direct grant to revoke — inheriting `PUBLIC`'s is the only way they ever had it), listed
-- explicitly anyway so this migration reads as a complete answer to "who can call these" without
-- needing PUBLIC's inheritance rules explained alongside it. Revoking a grant that already doesn't
-- exist is a no-op, not an error, so this is safe to run regardless of the exact grant state already
-- live in production.
revoke execute on function spend_credits(uuid, int) from public, anon, authenticated;
revoke execute on function refund_credits(uuid, int) from public, anon, authenticated;

-- `service_role` bypasses row-level security entirely, but RLS bypass and function EXECUTE grants
-- are two independent permission systems in Postgres — the former doesn't imply the latter. Granted
-- explicitly rather than assumed, so this migration is the complete, self-contained answer to "who
-- can call these" on its own.
grant execute on function spend_credits(uuid, int) to service_role;
grant execute on function refund_credits(uuid, int) to service_role;
