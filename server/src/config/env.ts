import "dotenv/config";

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: requiredEnv("CLIENT_ORIGIN", "http://localhost:5173"),
  mongoUri: requiredEnv("MONGODB_URI"),
};

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) {
  throw new Error("PORT must be a valid TCP port number");
}
