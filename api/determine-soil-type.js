import { GoogleGenerativeAI } from "@google/generative-ai";

const ALLOWED_SOIL_TYPES = ["sandy", "clay", "loamy", "silt"];

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const body = req.body || {};
    const {
      soilTexture,
      drainage,
      organicMatter,
      slope,
      issues,
    } = body;

    const GOOGLE_API_KEY =
      process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (!GOOGLE_API_KEY) {
      return res.status(500).json({ error: "Missing Google API Key" });
    }

    if (!soilTexture || !drainage || !organicMatter || !slope) {
      return res
        .status(400)
        .json({ error: "Missing required soil information fields." });
    }

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

    let text = "";
    try {
      // Standard način
      text = (result.response.text() || "").trim();
    } catch (e) {
      // Ako SDK promijeni strukturu, probaj iz candidates
      if (
        result &&
        result.response &&
        Array.isArray(result.response.candidates) &&
        result.response.candidates[0] &&
        result.response.candidates[0].content &&
        Array.isArray(result.response.candidates[0].content.parts) &&
        result.response.candidates[0].content.parts[0].text
      ) {
        text = String(
          result.response.candidates[0].content.parts[0].text
        ).trim();
      }
    }

    // --- Parsiranje odgovora ---

    let soilType = null;

    // 1) Pokušaj direktno parsirati JSON (bilo gdje u tekstu)
    if (text) {
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && typeof parsed.soilType === "string") {
            soilType = parsed.soilType.toLowerCase().trim();
          }
        }
      } catch (e) {
        // ako ne prođe JSON.parse, idemo dalje
      }
    }

    const lowerText = (text || "").toLowerCase();

    // 2) Ako JSON nije uspio, probaj po ključnim riječima
    if (!soilType) {
      if (lowerText.includes("loam")) soilType = "loamy";
      else if (lowerText.includes("sandy")) soilType = "sandy";
      else if (lowerText.includes("clay")) soilType = "clay";
      else if (lowerText.includes("silt")) soilType = "silt";
    }

    // 3) Ako i dalje ništa, koristi dodatnu heuristiku na osnovu opisa
    if (!soilType) {
      const comboText = [
        soilTexture,
        drainage,
        organicMatter,
        slope,
        issues || "",
      ]
        .join(" ")
        .toLowerCase();

      if (
        comboText.includes("sticky") ||
        comboText.includes("heavy") ||
        comboText.includes("poor drainage") ||
        comboText.includes("water often stands")
      ) {
        soilType = "clay";
      } else if (
        comboText.includes("gritty") ||
        comboText.includes("coarse") ||
        comboText.includes("drains very quickly")
      ) {
        soilType = "sandy";
      } else if (
        comboText.includes("silky") ||
        comboText.includes("very fine")
      ) {
        soilType = "silt";
      } else {
        // Ako je opis "zdrav", umjeren, bez ekstremnih karakteristika
        soilType = "loamy";
      }
    }

    // 4) Osiguraj da je vrijednost validna, ako nije -> default loamy
    if (!ALLOWED_SOIL_TYPES.includes(soilType)) {
      soilType = "loamy";
    }

    // U OVOM KORAKU VIŠE NIKAD NE VRAĆAMO 500 ZBOG PARSINGA
    return res.status(200).json({ soilType });
  } catch (error) {
    console.error("Error determining soil type:", error);
    return res
      .status(500)
      .json({ error: "Failed to determine soil type due to server error." });
  }
}
