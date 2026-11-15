import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(8788),
  /** Server-only. Without it, /api/receipt returns 503 and the app asks users to type amounts. */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.8-flash'),
  /** Comma-separated CORS origins. The Capacitor WebView origin is https://localhost. */
  CORS_ORIGINS: z.string().default('https://localhost,http://localhost,http://localhost:5174'),
  RECEIPTS_PER_MINUTE: z.coerce.number().int().positive().default(10),
  PRICE_CACHE_SECONDS: z.coerce.number().int().positive().default(60),
});

export type ServerConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid server config:\n${parsed.error.toString()}`);
  return parsed.data;
}
