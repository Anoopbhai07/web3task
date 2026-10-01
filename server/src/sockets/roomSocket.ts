import type { Server, Socket } from "socket.io";
import mongoose from "mongoose";
import {
  authenticateRoomSession,
  leaveRoom,
  RoomServiceError,
  removeParticipant,
  updateRoomPlayback,
  updateParticipantRole,
} from "../services/roomService.js";
import { can, type ProtectedAction } from "../services/permissions.js";
import { Room } from "../models/Room.js";
import type {
  AssignRolePayload,
  ClientToServerEvents,
  PublicParticipant,
  RemoveParticipantPayload,
  RoomSocketData,
  ServerToClientEvents,
} from "../types/socket.js";

type WatchPartyIo = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, RoomSocketData>;
type WatchPartySocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, RoomSocketData>;

function toPublicParticipant(participant: {
  userId: string;
  username: string;
  role: PublicParticipant["role"];
}): PublicParticipant {
  return {
    userId: participant.userId,
    username: participant.username,
    role: participant.role,
  };
}

function sendError(
  socket: WatchPartySocket,
  error: unknown,
  eventName?: string,
): void {
  if (error instanceof RoomServiceError) {
    socket.emit("room_error", {
      message: error.message,
      statusCode: error.statusCode,
      ...(eventName ? { eventName } : {}),
    });
    return;
  }

  console.error(`Socket ${eventName ?? "room"} operation failed:`, error);
  socket.emit("room_error", {
    message: mongoose.connection.readyState === 1 ? "Room operation failed" : "Database is unavailable. Please try again shortly.",
    statusCode: mongoose.connection.readyState === 1 ? 500 : 503,
    ...(eventName ? { eventName } : {}),
  });
}

async function requirePermission(
  socket: WatchPartySocket,
  action: ProtectedAction,
): Promise<PublicParticipant> {
  const { roomId, userId } = socket.data;
  if (!roomId || !userId || !socket.rooms.has(roomId)) {
    throw new RoomServiceError("Join the room before sending this event", 401);
  }

  const room = await Room.findOne({ roomCode: roomId });
  const participant = room?.participants.find((entry) => entry.userId === userId);
  if (!participant) {
    throw new RoomServiceError("This participant is no longer in the room", 401);
  }

  if (!can(participant.role, action)) {
    throw new RoomServiceError(`Your ${participant.role} role cannot ${action}`, 403);
  }

  // Refresh cached socket data after a role change; MongoDB remains authoritative.
  socket.data.role = participant.role;
  return toPublicParticipant(participant);
}

export function registerRoomSocket(io: WatchPartyIo): void {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("join_room", async (payload) => {
      try {
        if (!payload || typeof payload.roomId !== "string" || typeof payload.username !== "string") {
          throw new RoomServiceError("roomId and username are required", 400);
        }

        const roomId = payload.roomId.trim().toUpperCase();
        const token = socket.handshake.auth.sessionToken;
        const { room, participant } = await authenticateRoomSession(roomId, token);

        if (participant.username.toLowerCase() !== payload.username.trim().toLowerCase()) {
          throw new RoomServiceError("Username does not match this session", 401);
        }

        if (socket.data.roomId && socket.data.roomId !== roomId) {
          throw new RoomServiceError("This connection has already joined another room", 409);
        }

        const isAlreadyJoined = socket.data.roomId === roomId;
        await socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.userId = participant.userId;
        socket.data.username = participant.username;
        socket.data.role = participant.role;

        // Database records authenticate sessions; the Socket.IO room identifies who is online now.
        const onlineSockets = await io.in(roomId).fetchSockets();
        const publicParticipants = onlineSockets.flatMap((onlineSocket) => {
          const data = onlineSocket.data;
          if (!data.userId || !data.username || !data.role) return [];
          return [{ userId: data.userId, username: data.username, role: data.role }];
        });
        socket.emit("room_joined", { roomId, participants: publicParticipants });

        const elapsedSeconds = room.playback.playState === "playing"
          ? Math.max(0, (Date.now() - room.playback.updatedAt.getTime()) / 1000)
          : 0;
        socket.emit("sync_state", {
          playState: room.playback.playState,
          currentTime: room.playback.currentTime + elapsedSeconds,
          videoId: room.playback.videoId,
        });

        if (!isAlreadyJoined) {
          socket.to(roomId).emit("user_joined", toPublicParticipant(participant));
        }
      } catch (error) {
        sendError(socket, error);
      }
    });

    socket.on("leave_room", async (payload) => {
      const { roomId, userId, username, role } = socket.data;
      try {
        if (
          !roomId ||
          !userId ||
          !username ||
          !role ||
          !payload ||
          typeof payload.roomId !== "string" ||
          payload.roomId.trim().toUpperCase() !== roomId
        ) {
          throw new RoomServiceError("This connection has not joined that room", 409);
        }

        // Prevent a nearly simultaneous disconnect from removing the same user twice.
        socket.data.leaving = true;
        const result = await leaveRoom(roomId, userId);
        await socket.leave(roomId);
        socket.data = {};
        if (result.removed) io.to(roomId).emit("user_left", { userId, username, role });
        if (result.promoted) {
          const connectedSockets = await io.in(roomId).fetchSockets();
          for (const connectedSocket of connectedSockets) {
            if (connectedSocket.data.userId === result.promoted.userId) connectedSocket.data.role = "host";
          }
          io.to(roomId).emit("role_assigned", result.promoted);
        }
        socket.emit("room_left", { roomId });
      } catch (error) {
        sendError(socket, error);
      }
    });

    socket.on("disconnect", async (reason) => {
      const { roomId, userId, username, role } = socket.data;
      console.log(`Socket disconnected: ${socket.id} (${reason})`);

      if (!roomId || !userId || !username || !role || socket.data.leaving) return;

      try {
        const result = await leaveRoom(roomId, userId);
        if (result.removed) io.to(roomId).emit("user_left", { userId, username, role });
        if (result.promoted) {
          const connectedSockets = await io.in(roomId).fetchSockets();
          for (const connectedSocket of connectedSockets) {
            if (connectedSocket.data.userId === result.promoted.userId) connectedSocket.data.role = "host";
          }
          io.to(roomId).emit("role_assigned", result.promoted);
        }
      } catch (error) {
        console.error("Could not remove disconnected participant:", error);
      }
    });

    socket.on("play", async (payload) => {
      try {
        await requirePermission(socket, "play");
        const roomId = actorRoomId(socket);
        const time = optionalActionTime(payload);
        const state = await updateRoomPlayback(roomId, {
          playState: "playing",
          ...(time === undefined ? {} : { currentTime: time }),
        });
        socket.to(roomId).emit("play", { time: state.currentTime });
      } catch (error) {
        sendError(socket, error, "play");
      }
    });

    socket.on("pause", async (payload) => {
      try {
        await requirePermission(socket, "pause");
        const roomId = actorRoomId(socket);
        const time = optionalActionTime(payload);
        const state = await updateRoomPlayback(roomId, {
          playState: "paused",
          ...(time === undefined ? {} : { currentTime: time }),
        });
        socket.to(roomId).emit("pause", { time: state.currentTime });
      } catch (error) {
        sendError(socket, error, "pause");
      }
    });

    socket.on("seek", async (payload) => {
      try {
        await requirePermission(socket, "seek");
        const roomId = actorRoomId(socket);
        const time = requiredActionTime(payload);
        await updateRoomPlayback(roomId, { currentTime: time });
        socket.to(roomId).emit("seek", { time });
      } catch (error) {
        sendError(socket, error, "seek");
      }
    });

    socket.on("change_video", async (payload) => {
      try {
        await requirePermission(socket, "change_video");
        const roomId = actorRoomId(socket);
        const videoId = requiredVideoId(payload);
        await updateRoomPlayback(roomId, {
          videoId,
          playState: "paused",
          currentTime: 0,
        });
        io.to(roomId).emit("change_video", { videoId });
      } catch (error) {
        sendError(socket, error, "change_video");
      }
    });

    socket.on("assign_role", async (payload: AssignRolePayload) => {
      try {
        const actor = await requirePermission(socket, "assign_role");
        if (
          !payload ||
          typeof payload.userId !== "string" ||
          (payload.role !== "moderator" && payload.role !== "participant")
        ) {
          throw new RoomServiceError("userId and a valid assignable role are required", 400);
        }

        const updated = await updateParticipantRole(actorRoomId(socket), payload.userId, payload.role);
        const updatedPublic = toPublicParticipant(updated);
        const connectedSockets = await io.in(actorRoomId(socket)).fetchSockets();
        for (const connectedSocket of connectedSockets) {
          if (connectedSocket.data.userId === updated.userId) {
            connectedSocket.data.role = updated.role;
          }
        }
        io.to(actorRoomId(socket)).emit("role_assigned", updatedPublic);
      } catch (error) {
        sendError(socket, error, "assign_role");
      }
    });

    socket.on("remove_participant", async (payload: RemoveParticipantPayload) => {
      try {
        const actor = await requirePermission(socket, "remove_participant");
        if (!payload || typeof payload.userId !== "string") {
          throw new RoomServiceError("userId is required", 400);
        }

        const roomId = actorRoomId(socket);
        if (payload.userId === actor.userId) {
          throw new RoomServiceError("The host cannot remove itself", 409);
        }

        const removed = await removeParticipant(roomId, payload.userId);
        io.to(roomId).emit("participant_removed", removed);

        const connectedSockets = await io.in(roomId).fetchSockets();
        for (const connectedSocket of connectedSockets) {
          if (connectedSocket.data.userId === removed.userId) {
            connectedSocket.disconnect(true);
          }
        }
      } catch (error) {
        sendError(socket, error, "remove_participant");
      }
    });
  });
}

function actorRoomId(socket: WatchPartySocket): string {
  const roomId = socket.data.roomId;
  if (!roomId) throw new RoomServiceError("Join a room first", 401);
  return roomId;
}

function validateTime(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 86_400) {
    throw new RoomServiceError("Playback time must be between 0 and 86400 seconds", 400);
  }
  return value;
}

function optionalActionTime(payload: unknown): number | undefined {
  if (payload === undefined) return undefined;
  if (typeof payload !== "object" || payload === null || !("time" in payload)) {
    throw new RoomServiceError("time must be a number of seconds", 400);
  }
  return validateTime(payload.time);
}

function requiredActionTime(payload: unknown): number {
  if (typeof payload !== "object" || payload === null || !("time" in payload)) {
    throw new RoomServiceError("time must be a number of seconds", 400);
  }
  return validateTime(payload.time);
}

function requiredVideoId(payload: unknown): string {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("videoId" in payload) ||
    typeof payload.videoId !== "string" ||
    !/^[A-Za-z0-9_-]{11}$/.test(payload.videoId)
  ) {
    throw new RoomServiceError("videoId must be a valid 11-character YouTube video ID", 400);
  }
  return payload.videoId;
}
