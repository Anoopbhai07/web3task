import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "../types/socket";
import type { PlaybackCommand, RoomParticipant, RoomRole, RoomSession } from "../types/watchParty";

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ConnectionState = "idle" | "connecting" | "joined" | "disconnected" | "removed";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function useWatchParty(onPlaybackCommand: (command: PlaybackCommand) => void) {
  const socketRef = useRef<RoomSocket | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const onPlaybackCommandRef = useRef(onPlaybackCommand);
  const connectionStateRef = useRef<ConnectionState>("idle");
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [currentRole, setCurrentRole] = useState<RoomRole | null>(null);
  const [roomError, setRoomError] = useState("");

  onPlaybackCommandRef.current = onPlaybackCommand;

  const updateConnectionState = useCallback((next: ConnectionState) => {
    connectionStateRef.current = next;
    setConnectionState(next);
  }, []);

  const connectToRoom = useCallback((session: RoomSession) => {
    socketRef.current?.disconnect();
    setParticipants([]);
    setRoomError("");
    setCurrentRole(session.role);
    roomCodeRef.current = session.roomCode;
    updateConnectionState("connecting");

    const socket = io(SOCKET_URL, {
      auth: { sessionToken: session.sessionToken },
      reconnection: false,
    }) as RoomSocket;
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_room", { roomId: session.roomCode, username: session.username });
    });

    socket.on("room_joined", (snapshot) => {
      setParticipants(snapshot.participants);
      setRoomError("");
      updateConnectionState("joined");
    });

    socket.on("room_left", () => {
      roomCodeRef.current = null;
      setParticipants([]);
      setCurrentRole(null);
      updateConnectionState("idle");
      socket.disconnect();
    });

    socket.on("connect_error", () => {
      setRoomError("Could not connect to the Watch Party server. Check that it is running, then return to the join screen and try again.");
      updateConnectionState("disconnected");
    });

    socket.on("room_error", ({ message, eventName, statusCode }) => {
      setRoomError(eventName ? `${eventName}: ${message}` : message);
      if (connectionStateRef.current === "connecting" && statusCode >= 400) updateConnectionState("disconnected");
    });

    socket.on("user_joined", (participant) => {
      setParticipants((current) => [
        ...current.filter((entry) => entry.userId !== participant.userId),
        participant,
      ]);
    });

    socket.on("user_left", ({ userId }) => {
      setParticipants((current) => current.filter((entry) => entry.userId !== userId));
    });

    socket.on("role_assigned", (participant) => {
      setParticipants((current) => current.map((entry) => entry.userId === participant.userId ? participant : entry));
      if (participant.userId === session.userId) setCurrentRole(participant.role);
    });

    socket.on("participant_removed", (participant) => {
      setParticipants((current) => current.filter((entry) => entry.userId !== participant.userId));
      if (participant.userId === session.userId) {
        setRoomError("The host removed you from this room.");
        updateConnectionState("removed");
      }
    });

    socket.on("play", ({ time }) => onPlaybackCommandRef.current({ type: "play", time }));
    socket.on("pause", ({ time }) => onPlaybackCommandRef.current({ type: "pause", time }));
    socket.on("seek", ({ time }) => onPlaybackCommandRef.current({ type: "seek", time }));
    socket.on("change_video", ({ videoId }) => onPlaybackCommandRef.current({ type: "change_video", videoId }));
    socket.on("sync_state", (state) => onPlaybackCommandRef.current({ type: "sync_state", ...state }));

    socket.on("disconnect", () => {
      if (connectionStateRef.current !== "removed" && connectionStateRef.current !== "idle") {
        updateConnectionState("disconnected");
      }
    });
  }, [updateConnectionState]);

  const leaveRoom = useCallback(() => {
    const roomCode = roomCodeRef.current;
    const socket = socketRef.current;
    if (!roomCode || !socket) return;
    socket.emit("leave_room", { roomId: roomCode });
  }, []);

  const sendPlay = useCallback((time: number) => socketRef.current?.emit("play", { time }), []);
  const sendPause = useCallback((time: number) => socketRef.current?.emit("pause", { time }), []);
  const sendSeek = useCallback((time: number) => socketRef.current?.emit("seek", { time }), []);
  const sendChangeVideo = useCallback((videoId: string) => socketRef.current?.emit("change_video", { videoId }), []);
  const assignRole = useCallback((userId: string, role: "moderator" | "participant") => {
    socketRef.current?.emit("assign_role", { userId, role });
  }, []);
  const removeParticipant = useCallback((userId: string) => {
    socketRef.current?.emit("remove_participant", { userId });
  }, []);

  useEffect(() => () => {
    socketRef.current?.disconnect();
  }, []);

  return {
    connectionState,
    participants,
    currentRole,
    roomError,
    connectToRoom,
    leaveRoom,
    sendPlay,
    sendPause,
    sendSeek,
    sendChangeVideo,
    assignRole,
    removeParticipant,
  };
}
