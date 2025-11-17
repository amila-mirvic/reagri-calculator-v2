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

Return ONLY valid JSON in this exact format:
{"soilType": "<one of sandy, clay, loamy, silt>"}

Do NOT add any explanation, markdown, backticks or additional text.
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

    if (!soilType) {
      const lower = text.toLowerCase();
      if (lower.includes("loam")) soilType = "loamy";
      else if (lower.includes("sandy")) soilType = "sandy";
      else if (lower.includes("clay")) soilType = "clay";
      else if (lower.includes("silt")) soilType = "silt";
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
