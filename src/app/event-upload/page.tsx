import type { Metadata } from "next";
import { EventUpload } from "@/components/moments/event-upload";
export const metadata: Metadata = {
  title: "Adaugă momentele tale",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function EventUploadPage() {
  return <EventUpload />;
}
