export type RoomRole = "host" | "moderator" | "participant";

export interface RoomSession {
  roomCode: string;
  userId: string;
  username: string;
  role: RoomRole;
  sessionToken: string;
}

export interface RoomParticipant {
  userId: string;
  username: string;
  role: RoomRole;
}

export type PlaybackCommand =
  | { type: "play"; time: number }
  | { type: "pause"; time: number }
  | { type: "seek"; time: number }
  | { type: "change_video"; videoId: string }
  | { type: "sync_state"; playState: "playing" | "paused"; currentTime: number; videoId: string | null };
