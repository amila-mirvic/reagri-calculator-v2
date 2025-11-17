import { GoogleGenerativeAI } from "@google/generative-ai";

const ALLOWED_SOIL_TYPES = ["sandy", "clay", "loamy", "silt"];

/**
 * Deterministička heuristika zasnovana na agronomskim pravilima.
 * Nije random – uvijek daje isti rezultat za iste odgovore.
 */
function inferSoilTypeHeuristic({ soilTexture, drainage, organicMatter, slope, issues }) {
  const scores = {
    sandy: 0,
    clay: 0,
    loamy: 0,
    silt: 0,
  };

  const textureText = String(soilTexture || "").toLowerCase();
  const drainageText = String(drainage || "").toLowerCase();
  const organicText = String(organicMatter || "").toLowerCase();
  const slopeText = String(slope || "").toLowerCase();
  const issuesText = String(issues || "").toLowerCase();

  // --- Texture ---
  if (textureText.includes("gritty") || textureText.includes("coarse")) {
    scores.sandy += 3;
  }
  if (textureText.includes("smooth") || textureText.includes("silky") || textureText.includes("very fine")) {
    scores.silt += 3;
  }
  if (textureText.includes("sticky") || textureText.includes("heavy") || textureText.includes("hard to crumble")) {
    scores.clay += 3;
  }
  if (textureText.includes("crumbly") || textureText.includes("holds together but breaks easily")) {
    scores.loamy += 3;
  }

  // --- Drainage ---
  if (drainageText.includes("drains very quickly") || drainageText.includes("dries fast")) {
    scores.sandy += 3;
    scores.loamy += 1;
  }
  if (drainageText.includes("drains moderately") || drainageText.includes("no standing water")) {
    scores.loamy += 3;
  }
  if (drainageText.includes("stands for a few hours")) {
    scores.clay += 2;
    scores.silt += 2;
  }
  if (drainageText.includes("often stands") || drainageText.includes("long time") || drainageText.includes("puddles")) {
    scores.clay += 3;
    scores.silt += 2;
  }

  // --- Organic matter / fertility ---
  if (organicText.includes("very low") || organicText.includes("pale")) {
    scores.sandy += 1;
    scores.silt += 1;
  }
  if (organicText.includes("moderate")) {
    scores.loamy += 2;
  }
  if (organicText.includes("high") || organicText.includes("dark topsoil")) {
    scores.loamy += 3;
    scores.clay += 1;
  }

  // --- Slope / terrain ---
  if (slopeText.includes("flat") || slopeText.includes("almost flat")) {
    scores.clay += 1;
    scores.loamy += 1;
  }
  if (slopeText.includes("gentle")) {
    scores.loamy += 1;
  }
  if (slopeText.includes("medium to steep") || slopeText.includes("steep")) {
    scores.sandy += 1;
    scores.silt += 1;
  }

  // --- Issues (optional) ---
  if (issuesText.includes("erosion")) {
    scores.sandy += 2; // erozija češća kod pjeskovitih i lakših tala
  }
  if (issuesText.includes("compaction") || issuesText.includes("zbijen")) {
    scores.clay += 2; // zbijenost je tipična za glinena tla
  }
  if (issuesText.includes("poor yields") || issuesText.includes("low yield")) {
    scores.sandy += 1;
    scores.silt += 1;
  }

  // Odaberi tip tla sa najviše bodova (deterministički, nikad random)
  let bestType = "loamy";
  let bestScore = -Infinity;

  for (const type of ALLOWED_SOIL_TYPES) {
    if (scores[type] > bestScore) {
      bestScore = scores[type];
      bestType = type;
    }
  }

  return bestType;
}

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

  // 1) Heuristička procjena kao "stručna baza"
  let finalType = inferSoilTypeHeuristic({
    soilTexture,
    drainage,
    organicMatter,
    slope,
    issues,
  });

  try {
    // 2) AI procjena na osnovu jasnog stručnog prompta
    const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
You are an agronomy expert.

Your task is to classify the soil into ONE of these four standard soil types:

1) sandy  – coarse, gritty particles, very fast drainage, low water-holding capacity.
2) clay   – very fine particles, sticky when wet, heavy, slow drainage, often waterlogging.
3) loamy  – balanced mixture, crumbly structure, good drainage but still holds moisture, generally fertile.
4) silt   – very fine, smooth and silky, holds water longer than sand, moderate drainage.

Use ONLY the farmer's answers below:

- Texture when rubbed between fingers: ${soilTexture}
- Water behaviour after heavy rain: ${drainage}
- Organic matter / fertility level: ${organicMatter}
- Field slope / terrain: ${slope}
- Reported issues (if any): ${issues || "none"}

Step 1: Briefly reason about which type fits best and why.
Step 2: Select exactly ONE of: sandy, clay, loamy, silt.

Return your final answer as pure JSON in ONE LINE, like:
{"soilType":"loamy","confidence":0.82}

Where:
- soilType is exactly "sandy", "clay", "loamy" or "silt"
- confidence is a number between 0 and 1 (your subjective confidence).
    `.trim();

    const result = await model.generateContent(prompt);
    const rawText = (result?.response?.text?.() || "").trim();

    // Pokušaj da nađemo JSON u odgovoru
    let parsed = null;
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    } catch (e) {
      parsed = null;
    }

    let aiType = parsed?.soilType
      ? String(parsed.soilType).toLowerCase().trim()
      : null;
    const confidence =
      typeof parsed?.confidence === "number" ? parsed.confidence : null;

    // Ako je AI dao validan tip i razumna confidence vrijednost, koristimo ga
    if (aiType && ALLOWED_SOIL_TYPES.includes(aiType)) {
      // Opcija: možemo tražiti minimalni prag sigurnosti, npr. 0.4
      if (confidence == null || confidence >= 0.4) {
        finalType = aiType;
      }
      // ako je confidence prenizak, ostaje heuristički finalType
    }
    // ako AI ne da validan odgovor, ostaje heuristic finalType
  } catch (error) {
    console.error("Error determining soil type with AI, using heuristic only:", error);
    // Ne vraćamo grešku – koristimo već izračunati heuristički finalType
  }

  // Uvijek vraćamo smislen tip tla zasnovan NA ODGOVORIMA (AI + pravila, nikad random)
  return res.status(200).json({ soilType: finalType });
}
