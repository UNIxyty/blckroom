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
