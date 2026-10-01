import { model, Schema, type Document } from "mongoose";

export type RoomRole = "host" | "moderator" | "participant";
export type PlayState = "playing" | "paused";

export interface RoomParticipant {
  userId: string;
  username: string;
  role: RoomRole;
  joinedAt: Date;
  sessionTokenHash?: string;
}

export interface RoomDocument extends Document {
  roomCode: string;
  participants: RoomParticipant[];
  playback: {
    videoId: string | null;
    playState: PlayState;
    currentTime: number;
    updatedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const participantSchema = new Schema<RoomParticipant>(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["host", "moderator", "participant"],
      required: true,
    },
    joinedAt: { type: Date, default: Date.now },
    // Optional for rooms created before session tokens were introduced.
    sessionTokenHash: { type: String, required: false },
  },
  { _id: false },
);

const roomSchema = new Schema<RoomDocument>(
  {
    roomCode: { type: String, required: true, unique: true, index: true },
    participants: { type: [participantSchema], default: [] },
    playback: {
      videoId: { type: String, default: null },
      playState: {
        type: String,
        enum: ["playing", "paused"],
        default: "paused",
      },
      currentTime: { type: Number, default: 0, min: 0 },
      updatedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true },
);

export const Room = model<RoomDocument>("Room", roomSchema);
