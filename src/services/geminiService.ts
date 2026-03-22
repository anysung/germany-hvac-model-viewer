import { GoogleGenAI, Type, Schema } from "@google/genai";
import { HeatPump, Language } from "../types";

// Note: API Key is injected via vite.config.ts define
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey: apiKey });

/**
 * Live API search schema — returns simplified product data from Gemini.
 * Maps Gemini's string-based response into the new HeatPump shape.
 * NOTE: Live API mode is secondary to the primary DATABASE mode.
 */
const responseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      manufacturer: { type: Type.STRING, description: "The brand name of the heat pump." },
      model: { type: Type.STRING, description: "The specific model name/number." },
      refrigerant: { type: Type.STRING, description: "Type of refrigerant used (e.g., R290, R32)." },
      installation_type: { type: Type.STRING, description: "Installation type: 'Monoblock' or 'Split'." },
      power_35C_kw: { type: Type.NUMBER, description: "Nominal heating capacity at 35°C in kW." },
      cop_A7W35: { type: Type.NUMBER, description: "COP at A7/W35." },
      scop: { type: Type.NUMBER, description: "Seasonal COP." },
      noise_outdoor_dB: { type: Type.NUMBER, description: "Sound power level in dB(A)." },
      weight_kg: { type: Type.NUMBER, description: "Weight in kg." },
      equipment_price_typical_eur: { type: Type.NUMBER, description: "Approximate equipment price in EUR." },
    },
    required: ["manufacturer", "model", "refrigerant"],
  },
};

/** Map Gemini response item to HeatPump shape, filling nulls for missing fields */
function mapToHeatPump(raw: any): HeatPump {
  return {
    bafa_id: '',
    manufacturer: raw.manufacturer || '',
    model: raw.model || '',
    type: 'Luft / Wasser',
    refrigerant: raw.refrigerant || '',
    refrigerant_amount_kg: null,
    refrigerant_2: null,
    refrigerant_2_amount_kg: null,
    installation_type: raw.installation_type || null,
    power_35C_kw: raw.power_35C_kw ?? null,
    power_55C_kw: null,
    cop_A7W35: raw.cop_A7W35 ?? null,
    cop_A2W35: null,
    cop_AMinus7W35: null,
    scop: raw.scop ?? null,
    noise_outdoor_dB: raw.noise_outdoor_dB ?? null,
    noise_indoor_dB: null,
    width_mm: null,
    height_mm: null,
    depth_mm: null,
    weight_kg: raw.weight_kg ?? null,
    grid_ready: false,
    grid_ready_type: null,
    equipment_price_low_eur: null,
    equipment_price_typical_eur: raw.equipment_price_typical_eur ?? null,
    equipment_price_high_eur: null,
    equipment_price_display_eur: null,
    equipment_price_display_low_eur: null,
    equipment_price_display_high_eur: null,
    price_confidence: null,
    brand_tier: null,
    market_segment: null,
    capacity_band: null,
    refrigerant_group: null,
    package_scope: null,
  };
}

export const fetchHeatPumps = async (
  brand: string | null,
  capacity: string | null,
  unitType: string | null,
  searchQuery: string,
  language: Language = 'en'
): Promise<HeatPump[]> => {
  if (!apiKey) {
    console.error("Gemini API Key is missing.");
    alert("API Key is missing. AI Search will not work.");
    return [];
  }

  try {
    let prompt = `Provide technical specifications for Heat Pump products sold in the German market. The data must be based on real, existing products.\n`;

    if (searchQuery) {
      prompt += `Search keyword: "${searchQuery}"\nFind heat pumps for the German market that match or are related to this keyword.\n`;
    } else {
      if (brand) prompt += ` Manufacturer: ${brand}.`;
      else prompt += ` Include representative products from major popular manufacturers.`;
      if (capacity) prompt += ` Capacity Range: ${capacity}.`;
      if (unitType) prompt += ` Installation Type: ${unitType}.`;
    }

    const langInstruction = language === 'de'
      ? "Provide text content in German."
      : "Provide text content in English.";

    prompt += `
      For each product, include: manufacturer, model, refrigerant, installation_type (Monoblock or Split),
      power_35C_kw, cop_A7W35, scop, noise_outdoor_dB, weight_kg, equipment_price_typical_eur.
      ${langInstruction}
      The result must be strictly in JSON array format. Find up to 20 representative models.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: `You are a database expert on HVAC systems in Germany. You provide accurate, structured technical specifications for heat pumps in ${language === 'de' ? 'German' : 'English'}.`,
      },
    });

    if (response.text) {
      const raw = JSON.parse(response.text) as any[];
      return raw.map(mapToHeatPump);
    }
    return [];
  } catch (error) {
    console.error("Gemini API Error:", error);
    return [];
  }
};
