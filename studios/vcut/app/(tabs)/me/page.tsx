import AdminShortcut from "../../_shared/AdminShortcut";
import OwnProfile from "../../_shared/OwnProfile";

/** Me opens the signed-in owner's profile; claimed usernames use /@username. */
export default function MePage() {
  return (
    <>
      <AdminShortcut />
      <OwnProfile />
    </>
  );
}
