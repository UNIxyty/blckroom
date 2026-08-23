import { z } from "zod";

/**
 * The single source of truth for environment configuration.
 * Every service calls loadConfig() once at boot and fails loudly on anything
 * missing or malformed. No process.env reads anywhere else in the codebase.
 */
const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .min(16, "TELEGRAM_WEBHOOK_SECRET must be at least 16 chars"),
  PUBLIC_APP_URL: z.string().url("PUBLIC_APP_URL must be a URL"),

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_IMAGE_MODEL: z.string().min(1, "GEMINI_IMAGE_MODEL is required"),

  SUPABASE_URL: z.string().url("SUPABASE_URL must be a URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  SUPERADMIN_TELEGRAM_ID: z.coerce.bigint(),
  DEFAULT_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // Fail loudly: the process must not come up half-configured.
    console.error(`Invalid environment configuration:\n${lines}`);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

/** Test seam: clear the memoized config. */
export function resetConfigForTests(): void {
  cached = undefined;
}
