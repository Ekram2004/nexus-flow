import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


export async function verifyMatch(bankTx: any, internalTx: any) {
  if (process.env.NODE_ENV === "test") {
    return { isMatch: true, reason: "Mocked match for testing" };
  }

  const prompt = `
    You are an expert financial accountant.
    Compare these two transactions and decide if they represent the exact same financial event.

    Bank Transaction: ${JSON.stringify(bankTx)}
    Internal Record: ${JSON.stringify(internalTx)}

    Return a raw JSON object matching this schema:
    {
      "isMatch": boolean,
      "reason": string
    }`;

  try {
    // Modern API syntax uses ai.models.generateContent
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const jsonContent = response.text;
    if (!jsonContent) throw new Error("Empty text returned from Gemini");

    return JSON.parse(jsonContent);
  } catch (e) {
    console.error("Failed to fetch or parse Gemini response:", e);
    return {
      isMatch: false,
      reason: "Gemini execution error or parsing discrepancy occurred.",
    };
  }
}
