import type * as React from "react";
import {
  BedDouble,
  CalendarHeart,
  CircleHelp,
  Clock3,
  Contact,
  Gift,
  Heart,
  Image as ImageIcon,
  Images,
  LayoutTemplate,
  MapPin,
  Minus,
  PencilLine,
  Plus,
  Shirt,
  Users,
  Video,
} from "lucide-react";
import type {
  InvitationBlockKind,
  InvitationSection,
  InvitationSectionType,
} from "@/lib/invitations/editor-model";

export const invitationSectionIcons: Record<
  InvitationSectionType,
  React.ElementType
> = {
  hero: LayoutTemplate,
  story: Heart,
  countdown: Clock3,
  schedule: CalendarHeart,
  locations: MapPin,
  rsvp: PencilLine,
  dress_code: Shirt,
  gallery: Images,
  transport: Users,
  accommodation: BedDouble,
  faq: CircleHelp,
  contact: Contact,
  registry: Gift,
  custom: Plus,
};

export const invitationBlockIcons: Record<
  InvitationBlockKind,
  React.ElementType
> = {
  artwork: Images,
  video: Video,
  media_text: ImageIcon,
  divider: Minus,
};

export function invitationSectionIcon(section: InvitationSection) {
  const blockKind = section.content.blockKind;
  if (
    section.type === "custom" &&
    (blockKind === "artwork" ||
      blockKind === "video" ||
      blockKind === "media_text" ||
      blockKind === "divider")
  )
    return invitationBlockIcons[blockKind];
  return invitationSectionIcons[section.type];
}
