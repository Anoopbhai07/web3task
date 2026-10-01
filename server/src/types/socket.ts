import type { PlayState, RoomRole } from "../models/Room.js";

export interface JoinRoomPayload {
  roomId: string;
  username: string;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface SeekPayload {
  time: number;
}

export interface PlaybackActionPayload {
  time?: number;
}

export interface ChangeVideoPayload {
  videoId: string;
}

export interface AssignRolePayload {
  userId: string;
  role: "moderator" | "participant";
}

export interface RemoveParticipantPayload {
  userId: string;
}

export interface PublicParticipant {
  userId: string;
  username: string;
  role: RoomRole;
}

export interface ClientToServerEvents {
  join_room: (payload: JoinRoomPayload) => void;
  leave_room: (payload: LeaveRoomPayload) => void;
  play: (payload?: PlaybackActionPayload) => void;
  pause: (payload?: PlaybackActionPayload) => void;
  seek: (payload: SeekPayload) => void;
  change_video: (payload: ChangeVideoPayload) => void;
  assign_role: (payload: AssignRolePayload) => void;
  remove_participant: (payload: RemoveParticipantPayload) => void;
}

export interface ServerToClientEvents {
  room_joined: (payload: { roomId: string; participants: PublicParticipant[] }) => void;
  room_left: (payload: { roomId: string }) => void;
  room_error: (payload: { message: string; statusCode: number; eventName?: string }) => void;
  user_joined: (participant: PublicParticipant) => void;
  user_left: (participant: PublicParticipant) => void;
  role_assigned: (participant: PublicParticipant) => void;
  participant_removed: (participant: PublicParticipant) => void;
  play: (payload: { time: number }) => void;
  pause: (payload: { time: number }) => void;
  seek: (payload: SeekPayload) => void;
  change_video: (payload: ChangeVideoPayload) => void;
  sync_state: (payload: { playState: PlayState; currentTime: number; videoId: string | null }) => void;
}

export interface RoomSocketData {
  roomId?: string;
  userId?: string;
  username?: string;
  role?: RoomRole;
  leaving?: boolean;
}
