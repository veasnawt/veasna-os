-- Refunds credits spent on a job that failed before producing anything usable — confirmed as a real,
-- not hypothetical, gap: a live free-plan account spent its entire 5-credit balance on one Auto
-- Captions attempt and one Remove Object attempt, BOTH of which failed due to VCut's own
-- infrastructure (an unfunded OpenAI account, an unfunded Replicate account) rather than anything the
-- user did wrong. `spend_credits` (0003_credits.sql) is the ONLY place a spend is decided — this is
-- its mirror for the one case that needs undoing one: a job that started genuinely running (so the
-- spend was legitimate at the time) but then failed outright, not merely a user who cancelled midway
-- (which may have already incurred real provider-side cost, and stays un-refunded on purpose).
create or replace function refund_credits(p_user_id uuid, p_amount int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set credits_remaining = credits_remaining + p_amount, updated_at = now() where id = p_user_id;
end;
$$;
