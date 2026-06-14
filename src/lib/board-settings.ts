import { z } from "zod";

export const BoardSettingsSchema = z.object({
  whoCanPost: z.enum(["ANYONE", "AUTHENTICATED", "ADMINS_ONLY"]).default("AUTHENTICATED"),
  guestVotingEnabled: z.boolean().default(false),
  postModerationEnabled: z.boolean().default(false),
});

export type BoardSettings = z.infer<typeof BoardSettingsSchema>;

export const DEFAULT_BOARD_SETTINGS: BoardSettings = BoardSettingsSchema.parse({});
