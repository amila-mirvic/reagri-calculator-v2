import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { soilTexture, drainage, organicMatter, slope, issues } = req.body || {};
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: "Missing Google API Key" });
  }

  if (!soilTexture || !drainage || !organicMatter || !slope) {
    return res
      .status(400)
      .json({ error: "Missing required soil information fields." });
  }

  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = `
You are an agronomy expert. Based on the farmer's answers, classify the soil into ONE of the following types only:

- sandy
- clay
- loamy
- silt

Use ONLY the information below:

- Texture when rubbed between fingers: ${soilTexture}
- How water behaves after heavy rain: ${drainage}
- Organic matter / fertility level: ${organicMatter}
- Field slope / terrain: ${slope}
- Reported issues (if any): ${issues || "none"}

Choose the SINGLE most appropriate soil type from: sandy, clay, loamy, silt.

Return ONLY a SINGLE LINE of valid JSON.
Format MUST be exactly:
{"soilType":"sandy"} or {"soilType":"clay"} or {"soilType":"loamy"} or {"soilType":"silt"}

No explanations.
No markdown.
No labels.
No text before or after.
No line breaks.
No code fences.
Only pure JSON.

    `.trim();

    const result = await model.generateContent(prompt);
    const text = (result.response.text() || "").trim();

    let soilType;

    // Pokušaj direktnog JSON parse-a
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && typeof parsed.soilType === "string") {
          soilType = parsed.soilType.toLowerCase().trim();
        }
      }
    } catch (e) {
      // Ignorišemo, pokušat ćemo heuristički
    }

// Final fallback – if AI is confused or vague
if (!soilType) {
  if (text.toLowerCase().includes("sticky") ||
      text.toLowerCase().includes("heavy") ||
      text.toLowerCase().includes("poor drainage")) {
    soilType = "clay";
  } else if (text.toLowerCase().includes("gritty") ||
             text.toLowerCase().includes("coarse")) {
    soilType = "sandy";
  } else if (text.toLowerCase().includes("silky")) {
    soilType = "silt";
  } else {
    soilType = "loamy"; // safest default if uncertain
  }
}


    if (!soilType || !["sandy", "clay", "loamy", "silt"].includes(soilType)) {
      return res.status(500).json({
        error:
          "Failed to determine soil type from AI response. Please adjust your answers and try again.",
      });
    }

    return res.status(200).json({ soilType });
  } catch (error) {
    console.error("Error determining soil type:", error);
    return res
      .status(500)
      .json({ error: "Failed to determine soil type. Please try again." });
  }
}
