import { GoogleGenerativeAI } from "@google/generative-ai";

const ALLOWED_SOIL_TYPES = ["sandy", "clay", "loamy", "silt"];

export default async function handler(req, res) {
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

  // Validacija inputa iz prvog koraka
  if (!soilTexture || !drainage || !organicMatter || !slope) {
    return res
      .status(400)
      .json({ error: "Missing required soil information fields." });
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: "Missing Google API Key" });
  }

  // Default vrijednost - ako AI zakaže, imat ćemo barem neutralan tip tla
  let soilType = "loamy";

  try {
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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

Your answer MUST clearly contain the chosen soil type using exactly one of these words:
"sandy", "clay", "loamy" or "silt".

You may include a short explanation, but make sure the chosen word appears clearly in the text.
    `.trim();

    const result = await model.generateContent(prompt);

    const rawText = (result?.response?.text?.() || "").toLowerCase();
    // console.log("AI soil response:", rawText); // možeš uključiti za debug lokalno

    let extractedType = null;

    // 1) ako je AI vratio samo jednu riječ
    const cleaned = rawText.replace(/[^a-z]/g, " ").trim();
    if (ALLOWED_SOIL_TYPES.includes(cleaned)) {
      extractedType = cleaned;
    }

    // 2) tražimo ključne riječi u tekstu
    if (!extractedType) {
      if (rawText.includes("loam")) extractedType = "loamy";
      else if (rawText.includes("sandy")) extractedType = "sandy";
      else if (rawText.includes("clay")) extractedType = "clay";
      else if (rawText.includes("silt")) extractedType = "silt";
    }

    // 3) ako je pronađeno nešto validno, prepiši default
    if (extractedType && ALLOWED_SOIL_TYPES.includes(extractedType)) {
      soilType = extractedType;
    }
  } catch (error) {
    console.error("Error determining soil type with SDK:", error);
    // Ne bacamo 500 ovdje – samo ostavljamo default "loamy"
  }

  // Uvijek vraćamo 200 sa nekim soilType-om
  return res.status(200).json({ soilType });
}
