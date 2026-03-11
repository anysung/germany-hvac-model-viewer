import { GoogleGenAI, Type, Schema } from "@google/genai";
import { HeatPump, Language } from "../types";

// Note: API Key is injected via vite.config.ts define
const apiKey = process.env.API_KEY || '';

// Initialize client only if key exists to avoid immediate crash, verify in function
const ai = new GoogleGenAI({ apiKey: apiKey });

const responseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      manufacturer: { type: Type.STRING, description: "The brand name of the heat pump." },
      unitType: { type: Type.STRING, description: "Unit Type: 'IDU' for Indoor Unit, 'ODU' for Outdoor Unit." },
      model: { type: Type.STRING, description: "The specific model name/number." },
      capacityRange: { type: Type.STRING, description: "The nominal heating capacity in kW." },
      dimensions: { type: Type.STRING, description: "Dimensions (Height x Width x Depth) in mm." },
      refrigerant: { type: Type.STRING, description: "Type of refrigerant used (e.g., R290, R32)." },
      cop: { type: Type.STRING, description: "Coefficient of Performance (COP), typically at A7/W35." },
      scop: { type: Type.STRING, description: "Seasonal Coefficient of Performance (SCOP)." },
      noiseLevel: { type: Type.STRING, description: "Sound Power Level in dB(A)." },
      description: { type: Type.STRING, description: "A very brief summary of key features (max 1 sentence)." },
      others: { type: Type.STRING, description: "Any other notable technical specifications (e.g., weight, max flow temp, voltage) not covered in other fields." },
      marketPrice: { type: Type.STRING, description: "Approximate consumer price in Euros (€) found in the market (e.g. '€8,500'). Empty if unknown." },
    },
    required: ["manufacturer", "unitType", "model", "capacityRange", "dimensions", "refrigerant", "cop", "scop", "noiseLevel", "description", "others", "marketPrice"],
  },
};

export const fetchHeatPumps = async (
  brand: string | null,
  capacity: string | null,
  unitType: string | null,
  searchQuery: string,
  language: Language = 'en'
): Promise<HeatPump[]> => {
  // Safety check for API Key
  if (!apiKey) {
    console.error("Gemini API Key is missing. Please ensure API_KEY is set in your environment variables or .env file.");
    alert("API Key is missing. AI Search will not work.");
    return [];
  }

  try {
    let prompt = `
      Provide technical specifications for Heat Pump products sold in the German market.
      The data must be based on real, existing products.
    `;

    if (searchQuery) {
      prompt += `
        Search keyword: "${searchQuery}"
        Find heat pumps for the German market that match or are related to this keyword.
      `;
    } else {
      if (brand) {
        prompt += ` Manufacturer: ${brand}.`;
      } else {
        prompt += ` Include representative products from major popular manufacturers.`;
      }

      if (capacity) {
        prompt += ` Capacity Range: ${capacity}.`;
      }

      if (unitType) {
        prompt += ` Unit Type: Only return ${unitType === 'Indoor Unit (IDU)' ? 'Indoor Units (IDU)' : 'Outdoor Units (ODU)'}.`;
      } else {
        prompt += ` Include both Indoor Units (IDU) and Outdoor Units (ODU) where relevant, or specify the main unit type.`;
      }
    }

    const langInstruction = language === 'de' 
      ? "Provide the 'description', 'others' fields and any text content in German." 
      : "Provide the 'description', 'others' fields and any text content in English.";

    prompt += `
      For each product, include the following details:
      1. Manufacturer
      2. Unit Type (Strictly "IDU" or "ODU")
      3. Model Name
      4. Capacity (kW)
      5. Dimensions (HxWxD in mm)
      6. Refrigerant (e.g., R290, R32)
      7. COP (Coefficient of Performance, e.g., "5.2 (A7/W35)")
      8. SCOP (Seasonal Coefficient of Performance)
      9. Noise Level (Sound Power Level in dB(A))
      10. Description (Brief summary)
      11. Others (Any extra notable specs like Weight, Max Flow Temperature, Electrical connection, etc.)
      12. Market Price (Approximate consumer price in Euros € if available online, e.g., "€9,000 - €11,000" or "approx. €8,500". Leave empty if unknown).

      ${langInstruction}
      The result must be strictly in JSON array format.
      Find up to 20 representative models. Ensure high accuracy.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: `You are a database expert on HVAC systems in Germany. You provide accurate, structured technical specifications for heat pumps in ${language === 'de' ? 'German' : 'English'}. Always separate COP, SCOP, Noise Level, and other misc specs into distinct fields. Correctly identify if it is an Indoor Unit (IDU) or Outdoor Unit (ODU). Try to find approximate market prices.`,
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as HeatPump[];
    }
    return [];
  } catch (error) {
    console.error("Gemini API Error:", error);
    // Graceful fallback or re-throw
    return [];
  }
};

