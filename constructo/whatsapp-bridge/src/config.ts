/**
 * Environment-driven configuration. Loaded once at startup via dotenv.
 */
import "dotenv/config";

export interface BridgeConfig {
  backendUrl: string;
  ingestApiKey: string;
  mediaDir: string;
  authDir: string;
  /** When true, log payloads instead of POSTing them. */
  dryRun: boolean;
}

/** Parse a truthy env flag and/or the --dry-run CLI argument. */
function resolveDryRun(): boolean {
  const envFlag = (process.env.DRY_RUN ?? "").toLowerCase();
  const fromEnv = envFlag === "true" || envFlag === "1" || envFlag === "yes";
  const fromArg = process.argv.includes("--dry-run");
  return fromEnv || fromArg;
}

export function loadConfig(): BridgeConfig {
  return {
    backendUrl: process.env.BACKEND_URL ?? "http://localhost:8000",
    ingestApiKey: process.env.INGEST_API_KEY ?? "",
    mediaDir: process.env.MEDIA_DIR ?? "./media",
    authDir: process.env.AUTH_DIR ?? "./auth",
    dryRun: resolveDryRun(),
  };
}
