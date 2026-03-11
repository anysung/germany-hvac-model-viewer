const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');

admin.initializeApp();
const firestoreDb = admin.firestore();

const COUNTRY_CODE = 'DE';

// -------------------------------------------------------------------
// Budget Tracker
// Gemini 2.5 Flash pricing: $0.075/1M input, $0.30/1M output
// Google Search grounding: $35/1000 requests
// Default limit: $14 (~20,000 KRW)
// -------------------------------------------------------------------
class BudgetTracker {
  constructor(limitUsd = 14) {
    this.limitUsd = limitUsd;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.groundingRequests = 0;
    this.INPUT_COST_PER_TOKEN = 0.075 / 1e6;
    this.OUTPUT_COST_PER_TOKEN = 0.30 / 1e6;
    this.GROUNDING_COST_PER_REQ = 35 / 1000;
  }

  track(usageMetadata, isGrounded = false) {
    if (usageMetadata) {
      this.inputTokens += usageMetadata.promptTokenCount || 0;
      this.outputTokens += usageMetadata.candidatesTokenCount || 0;
    }
    if (isGrounded) this.groundingRequests++;
  }

  get cost() {
    return (this.inputTokens * this.INPUT_COST_PER_TOKEN)
      + (this.outputTokens * this.OUTPUT_COST_PER_TOKEN)
      + (this.groundingRequests * this.GROUNDING_COST_PER_REQ);
  }

  get isOverBudget() { return this.cost >= this.limitUsd; }

  get summary() {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      groundingRequests: this.groundingRequests,
      costUsd: parseFloat(this.cost.toFixed(4)),
      limitUsd: this.limitUsd,
      remainingUsd: parseFloat((this.limitUsd - this.cost).toFixed(4)),
    };
  }
}

// -------------------------------------------------------------------
// Manufacturers to research (sorted by priority)
// minProducts: target minimum number of products in DB
// priority: 1 = highest (researched first)
// -------------------------------------------------------------------
const MANUFACTURERS = [
  { name: 'Viessmann',          minProducts: 5, priority: 1 },
  { name: 'Vaillant',           minProducts: 5, priority: 1 },
  { name: 'Stiebel Eltron',     minProducts: 5, priority: 1 },
  { name: 'Buderus',            minProducts: 4, priority: 1 },
  { name: 'Daikin',             minProducts: 4, priority: 1 },
  { name: 'Nibe',               minProducts: 4, priority: 2 },
  { name: 'Wolf',               minProducts: 3, priority: 2 },
  { name: 'Bosch',              minProducts: 3, priority: 2 },
  { name: 'Weishaupt',          minProducts: 3, priority: 2 },
  { name: 'Alpha Innotec',      minProducts: 3, priority: 3 },
  { name: 'Ochsner',            minProducts: 2, priority: 3 },
  { name: 'Mitsubishi Electric', minProducts: 2, priority: 3 },
  { name: 'Panasonic',          minProducts: 2, priority: 3 },
  { name: 'LG',                 minProducts: 2, priority: 3 },
];

// -------------------------------------------------------------------
// Helper: Extract JSON array from Gemini text response
// -------------------------------------------------------------------
function extractJsonArray(text) {
  if (!text) return null;
  // Try to extract a JSON array from the response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractJsonObject(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------
// Research products for a single manufacturer using Gemini + Search
// Priority: 1) BAFA list, 2) Manufacturer site, 3) Retailer sites
// -------------------------------------------------------------------
async function researchManufacturerProducts(ai, manufacturer, existingModels, budget) {
  if (budget.isOverBudget) return [];

  const today = new Date().toISOString().split('T')[0];
  const existingNote = existingModels.length > 0
    ? `Already in our database: ${existingModels.join(', ')}. Keep updating these AND add NEW models not yet in our list.`
    : `No products for this manufacturer yet. Find as many as possible.`;

  const prompt = `You are a German heat pump database specialist. Search for ${manufacturer} heat pump (Wärmepumpe) products sold in Germany as of ${today}.

Research priority order:
1. BAFA eligible product list at bafa.de (Bundesamt für Wirtschaft und Ausfuhrkontrolle) - most authoritative
2. ${manufacturer} official German website or product catalog (datasheet/Produktdatenblatt)
3. German retailer/distributor sites (heizung.de, haustechnikdialog.de, selfio.de, hagebau.de, etc.)

${existingNote}

For each heat pump product found, provide a JSON object with these fields:
- manufacturer: brand name
- unitType: "ODU" (outdoor unit) or "IDU" (indoor unit)
- model: exact model name/number as shown by manufacturer
- capacityRange: nominal heating capacity, e.g. "5 kW" or "5-17 kW"
- dimensions: H x W x D in mm, e.g. "815 x 1100 x 500 mm"
- refrigerant: e.g. "R290", "R32", "R410A"
- cop: e.g. "5.1 (A7/W35)" - Coefficient of Performance
- scop: e.g. "4.90 (W35)" - Seasonal COP
- noiseLevel: Sound power level, e.g. "49 dB(A)"
- description: 1 sentence summarizing key features in English
- others: weight, max flow temperature, voltage, phases (e.g. "Weight: 130 kg; Max flow temp: 75°C; 230V 1-phase")
- marketPrice: approximate installer-to-consumer price range in EUR (e.g. "€9,000 - €11,000"). This is NOT the product purchase price but the total installed system cost estimate from market data.
- dataSource: one of "bafa", "manufacturer", "retailer", "estimated"

Rules:
- Use "N/A" for fields that cannot be found after searching
- Do NOT invent model names that don't exist
- If a value is uncertain, use "estimated" for dataSource
- Return ONLY a valid JSON array, no other text

JSON array:`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    budget.track(response.usageMetadata, true);

    const products = extractJsonArray(response.text);
    if (!products) {
      console.warn(`  Could not parse JSON for ${manufacturer}. Response snippet: ${(response.text || '').slice(0, 200)}`);
      return [];
    }

    // Filter out obviously invalid entries
    return products.filter(p => p && p.model && p.manufacturer);
  } catch (err) {
    console.error(`  Error researching ${manufacturer}: ${err.message}`);
    return [];
  }
}

// -------------------------------------------------------------------
// Research latest news and policies using Gemini + Search
// -------------------------------------------------------------------
async function researchNewsAndPolicies(ai, budget) {
  if (budget.isOverBudget) return { news: [], policies: [] };

  const today = new Date().toISOString().split('T')[0];
  const yearMonth = today.slice(0, 7).replace('-', '');

  const prompt = `Search for the latest news and policy updates about heat pumps (Wärmepumpen) in Germany as of ${today}.

Find 8-10 recent, relevant items covering:
- BAFA/BEG subsidy changes (Bundesförderung für effiziente Gebäude)
- Heat pump market trends and sales statistics in Germany
- New heat pump products or technology announcements
- GEG (Gebäudeenergiegesetz) regulatory updates
- Major manufacturer news (Viessmann, Vaillant, Stiebel Eltron, etc.)
- Industry reports from BWP (Bundesverband Wärmepumpe)

Also find 3-5 current policy/regulation items:
- Active BAFA/KfW subsidy programs with funding amounts
- GEG requirements
- ErP/efficiency standards

Return ONLY valid JSON with this exact structure:
{
  "news": [
    {
      "id": "news-${yearMonth}-001",
      "title": "Article title in English",
      "summary": "2-3 sentence summary in English",
      "sourceUrl": "https://actual-source-url.com",
      "date": "YYYY-MM-DDT00:00:00Z",
      "imageUrl": "https://images.unsplash.com/photo-1599690925058-90e1a0b327b8?auto=format&fit=crop&q=80&w=600"
    }
  ],
  "policies": [
    {
      "id": "pol-001",
      "title": "Policy name",
      "category": "Subsidy",
      "summary": "Description of the policy",
      "sourceUrl": "https://official-source.de"
    }
  ]
}

Use realistic Unsplash photo URLs for imageUrl. Increment the news ID counter (news-${yearMonth}-001, -002, etc.).
Return ONLY the JSON object, no other text:`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    budget.track(response.usageMetadata, true);

    const result = extractJsonObject(response.text);
    if (!result) {
      console.warn('Could not parse news/policy JSON.');
      return { news: [], policies: [] };
    }

    return {
      news: Array.isArray(result.news) ? result.news : [],
      policies: Array.isArray(result.policies) ? result.policies : [],
    };
  } catch (err) {
    console.error(`Error fetching news: ${err.message}`);
    return { news: [], policies: [] };
  }
}

// -------------------------------------------------------------------
// Utility: chunk array for Firestore batch writes (limit 500)
// -------------------------------------------------------------------
function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function deleteCollection(path, batchSize = 400) {
  const ref = firestoreDb.collection(path);
  const snapshot = await ref.orderBy('__name__').limit(batchSize).get();
  if (snapshot.empty) return;
  const batch = firestoreDb.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  if (snapshot.size >= batchSize) await deleteCollection(path, batchSize);
}

// -------------------------------------------------------------------
// Main update logic
// -------------------------------------------------------------------
async function runAutoUpdate(budget) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Step 1: Load existing products from Firestore
  console.log('Loading existing products from Firestore...');
  const productsRef = firestoreDb.collection(`countries/${COUNTRY_CODE}/products`);
  const existingSnapshot = await productsRef.get();

  const existingProducts = new Map(); // docId -> product data
  existingSnapshot.forEach(doc => existingProducts.set(doc.id, doc.data()));
  console.log(`Loaded ${existingProducts.size} existing products.`);

  // Step 2: Count products per manufacturer
  const manufacturerCounts = {};
  existingProducts.forEach(p => {
    manufacturerCounts[p.manufacturer] = (manufacturerCounts[p.manufacturer] || 0) + 1;
  });

  // Step 3: Sort by deficit (underrepresented manufacturers first)
  const sortedManufacturers = [...MANUFACTURERS].sort((a, b) => {
    const aDeficit = Math.max(0, a.minProducts - (manufacturerCounts[a.name] || 0));
    const bDeficit = Math.max(0, b.minProducts - (manufacturerCounts[b.name] || 0));
    if (bDeficit !== aDeficit) return bDeficit - aDeficit;
    return a.priority - b.priority;
  });

  console.log('Manufacturer research order:',
    sortedManufacturers.map(m => `${m.name}(${manufacturerCounts[m.name] || 0}/${m.minProducts})`).join(', ')
  );

  // Step 4: Research each manufacturer
  let productsAdded = 0;
  let productsUpdated = 0;
  const allResearchedProducts = [];

  for (const mfr of sortedManufacturers) {
    if (budget.isOverBudget) {
      console.log(`Budget limit reached ($${budget.cost.toFixed(3)}). Stopping research.`);
      break;
    }

    const existingModels = [];
    existingProducts.forEach(p => {
      if (p.manufacturer === mfr.name) existingModels.push(p.model);
    });

    console.log(`Researching ${mfr.name} (current: ${existingModels.length}, target: ${mfr.minProducts})...`);

    const products = await researchManufacturerProducts(ai, mfr.name, existingModels, budget);
    console.log(`  → Found ${products.length} products. Cost so far: $${budget.cost.toFixed(3)}`);

    allResearchedProducts.push(...products);

    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 400));
  }

  // Step 5: Merge researched products into Firestore (incremental)
  if (allResearchedProducts.length > 0) {
    const chunks = chunkArray(allResearchedProducts, 400);
    for (const chunk of chunks) {
      const batch = firestoreDb.batch();
      for (const product of chunk) {
        if (!product.model) continue;

        const docId = product.model.replace(/[^a-zA-Z0-9-_]/g, '_').toUpperCase();
        const docRef = productsRef.doc(docId);
        const existing = existingProducts.get(docId);

        if (existing) {
          // Update: only overwrite with better (non-N/A) data
          const merged = { ...existing };
          for (const key of Object.keys(product)) {
            const newVal = product[key];
            const oldVal = existing[key];
            if (newVal && newVal !== 'N/A' && newVal !== oldVal) {
              merged[key] = newVal;
            }
          }
          merged.lastVerified = new Date().toISOString();
          batch.set(docRef, merged);
          productsUpdated++;
        } else {
          // New product
          product.lastVerified = new Date().toISOString();
          batch.set(docRef, product);
          productsAdded++;
        }
      }
      await batch.commit();
    }
  }

  console.log(`Products: +${productsAdded} added, ~${productsUpdated} updated.`);

  // Step 6: Research and update news + policies
  console.log('Researching latest news and policies...');
  const { news, policies } = await researchNewsAndPolicies(ai, budget);
  console.log(`  → Found ${news.length} news items, ${policies.length} policy items.`);

  // Step 7: Replace news (always replace with fresh data)
  if (news.length > 0) {
    await deleteCollection(`countries/${COUNTRY_CODE}/news`);
    const newsRef = firestoreDb.collection(`countries/${COUNTRY_CODE}/news`);
    const batch = firestoreDb.batch();
    news.forEach((item, i) => {
      const id = item.id || `news-${Date.now()}-${i}`;
      batch.set(newsRef.doc(id), item);
    });
    await batch.commit();
  }

  // Step 8: Replace policies
  if (policies.length > 0) {
    await deleteCollection(`countries/${COUNTRY_CODE}/policies`);
    const policyRef = firestoreDb.collection(`countries/${COUNTRY_CODE}/policies`);
    const batch = firestoreDb.batch();
    policies.forEach((item, i) => {
      const id = item.id || `pol-${Date.now()}-${i}`;
      batch.set(policyRef.doc(id), item);
    });
    await batch.commit();
  }

  // Step 9: Update metadata
  const totalProducts = existingProducts.size + productsAdded;
  const metadata = {
    lastUpdated: new Date().toISOString(),
    productCount: totalProducts,
    newsCount: news.length,
    policyCount: policies.length,
    lastUpdateStats: {
      productsAdded,
      productsUpdated,
      budget: budget.summary,
    },
    source: 'auto-update (BAFA → manufacturer → retailer)',
  };

  await firestoreDb.collection('countries').doc(COUNTRY_CODE).set(metadata, { merge: true });

  return {
    productsAdded,
    productsUpdated,
    totalProducts,
    newsUpdated: news.length,
    policiesUpdated: policies.length,
    budget: budget.summary,
  };
}

// -------------------------------------------------------------------
// Cloud Function: autoUpdateDatabase
// Triggered by: Cloud Scheduler (monthly) or authenticated HTTP call
// -------------------------------------------------------------------
functions.http('autoUpdateDatabase', async (req, res) => {
  const SECRET_KEY = process.env.SECRET_KEY;

  // Allow Cloud Scheduler requests (identified by header) OR valid API key
  const isScheduler = req.headers['x-cloudscheduler'] === 'true';
  const providedKey = req.headers['x-api-key'];

  if (!isScheduler && (!SECRET_KEY || providedKey !== SECRET_KEY)) {
    console.warn(`Unauthorized access attempt from ${req.ip}`);
    return res.status(403).json({ error: 'Unauthorized: Invalid or missing API key' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not set' });
  }

  const budgetLimitUsd = parseFloat(process.env.BUDGET_LIMIT_USD || '14');
  const budget = new BudgetTracker(budgetLimitUsd);

  console.log(`=== Auto Update Started === Budget limit: $${budgetLimitUsd} | ${new Date().toISOString()}`);

  try {
    const result = await runAutoUpdate(budget);
    console.log('=== Auto Update Complete ===', JSON.stringify(result));
    return res.status(200).json({ status: 'success', ...result });
  } catch (err) {
    console.error('Auto Update Error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});
