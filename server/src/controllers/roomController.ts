import type { NextFunction, Request, Response } from "express";
import { createRoom, joinRoom } from "../services/roomService.js";

export async function createRoomHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await createRoom(request.body?.username);
    response.status(201).json(session);
  } catch (error) {
    next(error);
  }
}

export async function joinRoomHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const session = await joinRoom(request.params.roomCode, request.body?.username);
    response.status(201).json(session);
  } catch (error) {
    next(error);
  }
}
