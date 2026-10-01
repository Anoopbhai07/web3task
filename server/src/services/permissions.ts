import type { RoomRole } from "../models/Room.js";

export type ProtectedAction =
  | "play"
  | "pause"
  | "seek"
  | "change_video"
  | "assign_role"
  | "remove_participant";

const permissions: Record<RoomRole, readonly ProtectedAction[]> = {
  host: ["play", "pause", "seek", "change_video", "assign_role", "remove_participant"],
  moderator: ["play", "pause", "seek", "change_video"],
  participant: [],
};

export function can(role: RoomRole, action: ProtectedAction): boolean {
  return permissions[role].includes(action);
}

export function canControlPlayback(role: RoomRole): boolean {
  return can(role, "play") && can(role, "pause") && can(role, "seek");
}

export function canChangeVideo(role: RoomRole): boolean {
  return can(role, "change_video");
}

export function canAssignRole(role: RoomRole): boolean {
  return can(role, "assign_role");
}

export function canRemoveParticipant(role: RoomRole): boolean {
  return can(role, "remove_participant");
}
