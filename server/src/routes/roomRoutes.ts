import { Router } from "express";
import { createRoomHandler, joinRoomHandler } from "../controllers/roomController.js";

export const roomRoutes = Router();

roomRoutes.post("/", createRoomHandler);
roomRoutes.post("/:roomCode/join", joinRoomHandler);
