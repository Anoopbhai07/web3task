import type { RoomSession } from "../types/watchParty";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("The server took too long to respond. Please try again.");
    }
    throw new Error("Cannot reach the Watch Party server. Check your connection and try again.");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(response.ok ? "The server returned an unreadable response" : `Server error (${response.status}). Please try again.`);
  }
  if (!response.ok) {
    const message =
      typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
        ? result.error
        : "Room request failed";
    throw new Error(message);
  }
  return result as T;
}

export function createRoom(username: string): Promise<RoomSession> {
  return postJson<RoomSession>("/api/rooms", { username });
}

export function joinRoom(roomCode: string, username: string): Promise<RoomSession> {
  return postJson<RoomSession>(`/api/rooms/${encodeURIComponent(roomCode)}/join`, { username });
}
