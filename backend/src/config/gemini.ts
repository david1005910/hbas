import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_AI_API_KEY || "";

if (!apiKey || apiKey === "YOUR_KEY_HERE") {
  console.warn("[Gemini] GOOGLE_AI_API_KEY not set — AI generation will fail at runtime");
}

export const genAI = new GoogleGenerativeAI(apiKey);

export const geminiFlash = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
});

export const nanoBananaModel = genAI.getGenerativeModel({
  model: process.env.NANO_BANANA_MODEL || "gemini-2.5-flash-preview-04-17",
});
