import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Room, type RoomDocument, type RoomParticipant, type RoomRole } from "../models/Room.js";

export class RoomServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "RoomServiceError";
  }
}

export interface RoomSession {
  roomCode: string;
  userId: string;
  username: string;
  role: RoomRole;
  sessionToken: string;
}

export interface PlaybackSnapshot {
  playState: "playing" | "paused";
  currentTime: number;
  videoId: string | null;
}

export interface LeaveRoomResult {
  removed: boolean;
  roomClosed: boolean;
  promoted?: Pick<RoomParticipant, "userId" | "username" | "role">;
}

export const MAX_ROOM_PARTICIPANTS = 20;

function cleanUsername(username: unknown): string {
  if (typeof username !== "string") {
    throw new RoomServiceError("Username is required", 400);
  }

  const value = username.trim();
  if (value.length < 2 || value.length > 24) {
    throw new RoomServiceError("Username must be 2 to 24 characters", 400);
  }

  return value;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function makeSession(roomCode: string, username: string, role: RoomRole): RoomSession {
  const sessionToken = randomBytes(32).toString("base64url");

  return {
    roomCode,
    userId: randomUUID(),
    username,
    role,
    sessionToken,
  };
}

function addSession(room: RoomDocument, session: RoomSession): void {
  room.participants.push({
    userId: session.userId,
    username: session.username,
    role: session.role,
    joinedAt: new Date(),
    sessionTokenHash: hashToken(session.sessionToken),
  });
}

export async function createRoom(usernameInput: unknown): Promise<RoomSession> {
  const username = cleanUsername(usernameInput);

  // Retry a few times in the very unlikely case that a generated code already exists.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const roomCode = randomBytes(4).toString("hex").toUpperCase();
    const session = makeSession(roomCode, username, "host");

    try {
      const room = new Room({ roomCode });
      addSession(room, session);
      await room.save();
      return session;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new RoomServiceError("Could not generate a unique room code; try again", 503);
}

export async function joinRoom(
  roomCodeInput: unknown,
  usernameInput: unknown,
): Promise<RoomSession> {
  if (typeof roomCodeInput !== "string") {
    throw new RoomServiceError("Room code is required", 400);
  }
  const roomCode = roomCodeInput.trim().toUpperCase();
  const username = cleanUsername(usernameInput);

  if (!/^[A-F0-9]{8}$/.test(roomCode)) {
    throw new RoomServiceError("Room code is invalid", 400);
  }

  const room = await Room.findOne({ roomCode });
  if (!room) {
    throw new RoomServiceError("Room not found", 404);
  }

  if (room.participants.length >= MAX_ROOM_PARTICIPANTS) {
    throw new RoomServiceError(`Room is full (maximum ${MAX_ROOM_PARTICIPANTS} participants)`, 409);
  }

  const duplicateName = room.participants.some(
    (participant) => participant.username.toLowerCase() === username.toLowerCase(),
  );
  if (duplicateName) {
    throw new RoomServiceError("That username is already in use in this room", 409);
  }

  const session = makeSession(roomCode, username, "participant");
  addSession(room, session);
  await room.save();

  return session;
}

export async function leaveRoom(roomCode: string, userId: string): Promise<LeaveRoomResult> {
  const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
  if (!room) return { removed: false, roomClosed: false };

  const leaving = room.participants.find((participant) => participant.userId === userId);
  if (!leaving) return { removed: false, roomClosed: false };
  room.participants = room.participants.filter((participant) => participant.userId !== userId);
  if (leaving.role === "host" && room.participants.length > 0) {
    const nextHost = [...room.participants].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
    if (nextHost) nextHost.role = "host";
  }
  if (room.participants.length === 0) {
    await room.deleteOne();
    return { removed: true, roomClosed: true };
  }
  await room.save();
  const promoted = leaving.role === "host"
    ? room.participants.find((participant) => participant.role === "host")
    : undefined;
  return {
    removed: true,
    roomClosed: false,
    ...(promoted ? { promoted: { userId: promoted.userId, username: promoted.username, role: promoted.role } } : {}),
  };
}

export async function authenticateRoomSession(
  roomCodeInput: unknown,
  sessionTokenInput: unknown,
): Promise<{ room: RoomDocument; participant: RoomDocument["participants"][number] }> {
  if (typeof roomCodeInput !== "string" || typeof sessionTokenInput !== "string") {
    throw new RoomServiceError("Room code and session token are required", 401);
  }

  const roomCode = roomCodeInput.trim().toUpperCase();
  const room = await Room.findOne({ roomCode });
  if (!room) {
    throw new RoomServiceError("Room not found", 404);
  }

  const presentedHash = hashToken(sessionTokenInput);
  const presentedBytes = Buffer.from(presentedHash, "hex");
  const participant = room.participants.find((entry) => {
    if (typeof entry.sessionTokenHash !== "string") return false;
    const storedBytes = Buffer.from(entry.sessionTokenHash, "hex");
    return storedBytes.length === presentedBytes.length && timingSafeEqual(storedBytes, presentedBytes);
  });

  if (!participant) {
    throw new RoomServiceError("Session is not authorized for this room", 401);
  }

  return { room, participant };
}

export async function updateParticipantRole(
  roomCode: string,
  userId: string,
  role: "moderator" | "participant",
): Promise<RoomParticipant> {
  const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
  if (!room) throw new RoomServiceError("Room not found", 404);

  const participant = room.participants.find((entry) => entry.userId === userId);
  if (!participant) throw new RoomServiceError("Participant not found", 404);
  if (participant.role === "host") {
    throw new RoomServiceError("Host role cannot be reassigned in this MVP", 409);
  }

  participant.role = role;
  await room.save();
  return participant;
}

export async function removeParticipant(
  roomCode: string,
  userId: string,
): Promise<Pick<RoomParticipant, "userId" | "username" | "role">> {
  const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
  if (!room) throw new RoomServiceError("Room not found", 404);

  const participant = room.participants.find((entry) => entry.userId === userId);
  if (!participant) throw new RoomServiceError("Participant not found", 404);
  if (participant.role === "host") {
    throw new RoomServiceError("The host cannot be removed", 409);
  }

  const removedParticipant = {
    userId: participant.userId,
    username: participant.username,
    role: participant.role,
  };
  room.participants = room.participants.filter((entry) => entry.userId !== userId);
  await room.save();
  return removedParticipant;
}

export async function updateRoomPlayback(
  roomCode: string,
  update: Partial<PlaybackSnapshot>,
): Promise<PlaybackSnapshot> {
  const room = await Room.findOne({ roomCode: roomCode.toUpperCase() });
  if (!room) throw new RoomServiceError("Room not found", 404);

  if (update.playState !== undefined) room.playback.playState = update.playState;
  if (update.currentTime !== undefined) room.playback.currentTime = update.currentTime;
  if (update.videoId !== undefined) room.playback.videoId = update.videoId;
  room.playback.updatedAt = new Date();
  await room.save();

  return {
    playState: room.playback.playState,
    currentTime: room.playback.currentTime,
    videoId: room.playback.videoId,
  };
}
