import type { Metadata, Viewport } from "next";
import AdminConsole from "./AdminConsole";
export const metadata: Metadata = {
  title: "VCut Admin",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};
export default function AdminPage() {
  return <AdminConsole />;
}
