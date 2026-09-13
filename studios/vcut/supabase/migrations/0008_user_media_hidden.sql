-- user_media.hidden: true for a library row that isn't really "the user's own media" in the sense
-- this table otherwise means — a stock sound effect or a voiceover take placed on a project's
-- timeline (see Asset.hiddenFromLibrary in packages/vcut/src/project/types.ts, which already keeps
-- these off that PROJECT's own Media tab). "All my media" (media/library/route.ts's GET, backed by
-- listUserMedia below) is a different listing over this same table though — plugging a stock SFX/
-- voiceover clip into a project still lands its real file here (it's real disk space, still charged
-- against the owner's own storage quota via getStorageUsageBytes, which deliberately does NOT filter
-- on this column), so without a column of its own here too, it would surface in the account-wide
-- library anyway despite being invisible in the one project it actually came from — a real, reported
-- bug ("audio effects shouldn't be added to Media").
--
-- Does NOT cover AI generations or stock downloads, even though `Asset.hiddenFromLibrary` is ALSO set
-- on those client-side — that flag only ever meant "keep this off the CURRENT project's own Media tab"
-- (a generation belongs in its own "All my generations" view instead, per `useLibraryMedia.ts`'s own
-- doc comment), never "keep this out of the account library entirely." Those routes insert with
-- `hidden: false` — this column is strictly narrower than the client-side flag it's related to.

alter table user_media add column if not exists hidden boolean not null default false;
