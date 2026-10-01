import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5_000 });
  console.log("Connected to MongoDB");
}
