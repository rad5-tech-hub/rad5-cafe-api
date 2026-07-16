import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN || "https://041c9b46933fc57cf6ae873b9e19345b@o4507437373980672.ingest.de.sentry.io/4511744369885264";

// dsn is supported at runtime; cast needed due to incomplete v10 types
Sentry.init({
  dsn,
  environment: process.env.NODE_ENV || "development",
  tracesSampleRate: 1.0,
} as any);
