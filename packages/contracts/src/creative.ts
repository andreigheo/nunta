import { z } from "zod";

const creativeColorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  hex: z.string().regex(/^#[0-9A-F]{6}$/i),
});

const creativeItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["image", "text", "color", "link", "vendor"]),
  label: z.string().trim().min(1).max(240),
  category: z.string().trim().min(1).max(80),
  note: z.string().trim().max(1000).nullable(),
  sourceUrl: z.string().url().max(2048).nullable(),
  mediaId: z.string().uuid().nullable(),
  fileName: z.string().trim().max(255).nullable(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .nullable(),
  position: z.number().int().min(0).max(10_000),
});

const creativeBoardSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  items: z.array(creativeItemSchema).max(200),
});

export const workspaceCreativeStateSchema = z.object({
  id: z.string().uuid().nullable(),
  workspaceId: z.string().uuid(),
  conceptTitle: z.string().max(180),
  conceptDescription: z.string().max(4000),
  palette: z.array(creativeColorSchema).max(20),
  boards: z.array(creativeBoardSchema).max(20),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  version: z.number().int().nonnegative(),
});

export const updateWorkspaceCreativeStateSchema = z.object({
  conceptTitle: z.string().trim().max(180),
  conceptDescription: z.string().trim().max(4000),
  palette: z.array(creativeColorSchema).max(20),
  boards: z.array(creativeBoardSchema).max(20),
});

export type WorkspaceCreativeState = z.infer<
  typeof workspaceCreativeStateSchema
>;
export type UpdateWorkspaceCreativeState = z.infer<
  typeof updateWorkspaceCreativeStateSchema
>;
export type WorkspaceCreativeBoard = z.infer<typeof creativeBoardSchema>;
export type WorkspaceCreativeItem = z.infer<typeof creativeItemSchema>;
