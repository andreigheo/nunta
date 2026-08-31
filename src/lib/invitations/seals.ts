export const invitationSealStyles = [
  "monogram",
  "botanical",
  "sunburst",
  "knot",
] as const;

export type InvitationSealStyle = (typeof invitationSealStyles)[number];

export const invitationSealOptions: Array<{
  id: InvitationSealStyle;
  label: string;
  description: string;
  asset: string;
}> = [
  {
    id: "monogram",
    label: "Monogramă",
    description: "Inițialele tale, presate în ceară",
    asset: "/images/invitations/seals/wax-monogram.png",
  },
  {
    id: "botanical",
    label: "Botanic",
    description: "Floare în relief, organică și delicată",
    asset: "/images/invitations/seals/wax-botanical.png",
  },
  {
    id: "sunburst",
    label: "Solar",
    description: "Explozie festivă, luminoasă și modernă",
    asset: "/images/invitations/seals/wax-sunburst.png",
  },
  {
    id: "knot",
    label: "Legătură",
    description: "Nod continuu pentru oameni adunați împreună",
    asset: "/images/invitations/seals/wax-knot.png",
  },
];

export function isInvitationSealStyle(
  value: unknown,
): value is InvitationSealStyle {
  return invitationSealStyles.includes(value as InvitationSealStyle);
}

export function invitationSealAsset(style: InvitationSealStyle) {
  return (
    invitationSealOptions.find((option) => option.id === style)?.asset ??
    "/images/invitations/seals/wax-monogram.png"
  );
}
