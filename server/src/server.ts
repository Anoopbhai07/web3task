import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { RoomServiceError } from "./services/roomService.js";
import { roomRoutes } from "./routes/roomRoutes.js";
import { registerRoomSocket } from "./sockets/roomSocket.js";
import type { ClientToServerEvents, RoomSocketData, ServerToClientEvents } from "./types/socket.js";
import "./models/Room.js";

const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: env.clientOrigin }));
app.use(express.json());
app.use("/api/rooms", roomRoutes);

app.get("/health", (_request, response) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  response.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "ok" : "degraded",
    database: databaseConnected ? "connected" : "unavailable",
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof RoomServiceError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  if (mongoose.connection.readyState !== 1 || isMongoUnavailableError(error)) {
    response.status(503).json({ error: "Database is unavailable. Please try again shortly." });
    return;
  }

  if (isMalformedJsonError(error)) {
    response.status(400).json({ error: "Request body must contain valid JSON" });
    return;
  }

  console.error("Request failed:", error);
  response.status(500).json({ error: "Internal server error" });
});

function isMongoUnavailableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  return ["MongooseServerSelectionError", "MongoNetworkError", "MongoTopologyClosedError"].includes(String(error.name));
}

function isMalformedJsonError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed";
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, RoomSocketData>(httpServer, {
  cors: { origin: env.clientOrigin },
});

registerRoomSocket(io);

async function startServer(): Promise<void> {
  await connectDatabase();

  httpServer.listen(env.port, "0.0.0.0", () => {
  console.log(`Watch Party API listening on port ${env.port}`);
});
}
startServer().catch((error: unknown) => {
  console.error("Server startup failed:", error);
  process.exitCode = 1;
});
