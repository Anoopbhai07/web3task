import type { RoomParticipant, RoomRole } from "./watchParty";

export interface ClientToServerEvents {
  join_room: (payload: { roomId: string; username: string }) => void;
  leave_room: (payload: { roomId: string }) => void;
  play: (payload?: { time?: number }) => void;
  pause: (payload?: { time?: number }) => void;
  seek: (payload: { time: number }) => void;
  change_video: (payload: { videoId: string }) => void;
  assign_role: (payload: { userId: string; role: "moderator" | "participant" }) => void;
  remove_participant: (payload: { userId: string }) => void;
}

export interface ServerToClientEvents {
  room_joined: (payload: { roomId: string; participants: RoomParticipant[] }) => void;
  room_left: (payload: { roomId: string }) => void;
  room_error: (payload: { message: string; statusCode: number; eventName?: string }) => void;
  user_joined: (participant: RoomParticipant) => void;
  user_left: (participant: RoomParticipant) => void;
  role_assigned: (participant: RoomParticipant) => void;
  participant_removed: (participant: RoomParticipant) => void;
  play: (payload: { time: number }) => void;
  pause: (payload: { time: number }) => void;
  seek: (payload: { time: number }) => void;
  change_video: (payload: { videoId: string }) => void;
  sync_state: (payload: { playState: "playing" | "paused"; currentTime: number; videoId: string | null }) => void;
}

export type { RoomRole };
