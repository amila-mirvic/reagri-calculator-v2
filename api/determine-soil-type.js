import { GoogleGenerativeAI } from "@google/generative-ai";

const ALLOWED_SOIL_TYPES = ["sandy", "clay", "loamy", "silt"];

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const {
      soilTexture,
      drainage,
      organicMatter,
      slope,
      issues,
    } = req.body || {};

    // Osnovna validacija inputa iz prvog koraka
    if (!soilTexture || !drainage || !organicMatter || !slope) {
      return res
        .status(400)
        .json({ error: "Missing required soil information fields." });
    }

    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ error: "Missing Google API Key" });
    }

    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // Prompt: AI samo klasificira i vrati tekst u kojem se sigurno spominje tip tla
    const prompt = `
You are an agronomy expert. Classify the soil into ONE of these four types:

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

First, think briefly about the characteristics, then state clearly which soil type is the best match.
Your answer MUST include the exact word for one of the soil types: "sandy", "clay", "loamy" or "silt".
You may add a short explanation, but make sure the chosen word appears clearly in the text.
    `.trim();

    const result = await model.generateContent(prompt);
    const rawText = (result.response.text() || "").toLowerCase();

    let soilType = null;

    // 1) ako direktno vrati jednu od riječi
    const trimmed = rawText.replace(/[^a-z]/g, " ").trim();
    if (ALLOWED_SOIL_TYPES.includes(trimmed)) {
      soilType = trimmed;
    }

    // 2) inače tražimo pojavu riječi u tekstu
    if (!soilType) {
      if (rawText.includes("loam")) soilType = "loamy";
      else if (rawText.includes("sandy")) soilType = "sandy";
      else if (rawText.includes("clay")) soilType = "clay";
      else if (rawText.includes("silt")) soilType = "silt";
    }

    // 3) safety net – ako AI zblesavi, koristimo loamy kao neutralan default
    if (!soilType || !ALLOWED_SOIL_TYPES.includes(soilType)) {
      soilType = "loamy";
    }

    return res.status(200).json({ soilType });
  } catch (error) {
    console.error("Error determining soil type with SDK:", error);
    return res
      .status(500)
      .json({ error: "Failed to determine soil type." });
  }
}
