export type Role = "pending" | "barber" | "owner" | "superadmin";
export type UserStatus = "pending" | "active" | "suspended";

export type SessionStatus =
  | "consented"
  | "uploaded"
  | "generating"
  | "complete"
  | "partial"
  | "failed"
  | "expired";

export type GenerationStatus =
  | "queued"
  | "running"
  | "done"
  | "failed";

export type JobType =
  | "generate"
  | "compose_sheet"
  | "deliver"
  | "retention_sweep";

export type JobStatus = "queued" | "running" | "done" | "failed" | "dead";

/** Upload size cap, enforced client-side (clear message) and server-side. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_MB = 15;

/** At most this many active haircuts — the sheet is a 3×3 grid. */
export const MAX_ACTIVE_HAIRCUTS = 9;
