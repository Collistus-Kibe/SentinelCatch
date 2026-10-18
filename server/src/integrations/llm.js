import { z } from 'zod';
import config from '../config.js';
import logger from '../logger.js';

const OutputSchema = z.object({
  score_adjustment: z.number().min(-15).max(15),
  rationale: z.string().min(15),
  key_factors: z.array(z.string()).default([]),
});

export class LLMClient {
  constructor() {
    this.geminiKeys = [
      config.GEMINI_API_KEY_1,
      config.GEMINI_API_KEY_2,
      config.GEMINI_API_KEY,
    ].filter((k) => typeof k === 'string' && k.trim().length > 5);

    this.openaiKeys = [
      config.OPENAI_API_KEY_1,
      config.OPENAI_API_KEY_2,
      config.OPENAI_API_KEY,
      config.CHATGPT_API_KEY_1,
      config.CHATGPT_API_KEY_2,
      config.CHATGPT_API_KEY,
    ].filter((k) => typeof k === 'string' && k.trim().length > 5);

    this.geminiIndex = 0;
    this.openaiIndex = 0;

    this.preferredProvider = config.LLM_PROVIDER || 'hybrid';
    this.geminiModel = config.LLM_MODEL || 'gemini-2.5-flash';
    this.openaiModel = config.OPENAI_MODEL || 'gpt-4o-mini';
  }

  isConfigured() {
    return this.geminiKeys.length > 0 || this.openaiKeys.length > 0;
  }

  getActiveGeminiKey() {
    if (this.geminiKeys.length === 0) return null;
    return this.geminiKeys[this.geminiIndex % this.geminiKeys.length];
  }

  rotateGeminiKey() {
    if (this.geminiKeys.length > 1) {
      this.geminiIndex = (this.geminiIndex + 1) % this.geminiKeys.length;
      logger.info({ newSlot: this.geminiIndex + 1 }, 'Rotated to next Gemini API key slot');
    }
  }

  getActiveOpenAIKey() {
    if (this.openaiKeys.length === 0) return null;
    return this.openaiKeys[this.openaiIndex % this.openaiKeys.length];
  }

  rotateOpenAIKey() {
    if (this.openaiKeys.length > 1) {
      this.openaiIndex = (this.openaiIndex + 1) % this.openaiKeys.length;
      logger.info({ newSlot: this.openaiIndex + 1 }, 'Rotated to next OpenAI/ChatGPT API key slot');
    }
  }

  /**
   * Universal text generation with automatic key-slot rotation and dual-provider fallback.
   */
  async generate({ prompt, systemPrompt = '', jsonMode = false }) {
    // Try Gemini first if preferred or hybrid
    if (this.preferredProvider !== 'openai' && this.geminiKeys.length > 0) {
      const res = await this._callGemini({ prompt, systemPrompt, jsonMode });
      if (res) return res;
    }

    // Try OpenAI/ChatGPT if available
    if (this.openaiKeys.length > 0) {
      const res = await this._callOpenAI({ prompt, systemPrompt, jsonMode });
      if (res) return res;
    }

    // Secondary fallback: if preferred was OpenAI, try Gemini
    if (this.preferredProvider === 'openai' && this.geminiKeys.length > 0) {
      const res = await this._callGemini({ prompt, systemPrompt, jsonMode });
      if (res) return res;
    }

    return null;
  }

  async _callGemini({ prompt, systemPrompt = '', jsonMode = false }) {
    for (let attempts = 0; attempts < Math.max(1, this.geminiKeys.length); attempts++) {
      const key = this.getActiveGeminiKey();
      if (!key) break;

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${key}`;
        const body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.15,
            maxOutputTokens: 1000,
          },
        };

        if (jsonMode) {
          body.generationConfig.responseMimeType = 'application/json';
        }
        if (systemPrompt) {
          body.systemInstruction = { parts: [{ text: systemPrompt }] };
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.status === 429 || res.status === 403) {
          logger.warn({ status: res.status, slot: this.geminiIndex + 1 }, 'Gemini key rate limited or quota exceeded; rotating slot');
          this.rotateGeminiKey();
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          logger.warn({ status: res.status, errText: errText.slice(0, 160) }, 'Gemini API call failed');
          this.rotateGeminiKey();
          continue;
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { text, provider: 'gemini', model: this.geminiModel };
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'Network error calling Gemini API');
        this.rotateGeminiKey();
      }
    }
    return null;
  }

  async _callOpenAI({ prompt, systemPrompt = '', jsonMode = false }) {
    for (let attempts = 0; attempts < Math.max(1, this.openaiKeys.length); attempts++) {
      const key = this.getActiveOpenAIKey();
      if (!key) break;

      try {
        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });

        const body = {
          model: this.openaiModel,
          messages,
          temperature: 0.2,
          max_tokens: 1000,
        };
        if (jsonMode) {
          body.response_format = { type: 'json_object' };
        }

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body),
        });

        if (res.status === 429 || res.status === 401) {
          logger.warn({ status: res.status, slot: this.openaiIndex + 1 }, 'OpenAI key limit/unauthorized; rotating slot');
          this.rotateOpenAIKey();
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          logger.warn({ status: res.status, errText: errText.slice(0, 160) }, 'OpenAI API call failed');
          this.rotateOpenAIKey();
          continue;
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return { text, provider: 'openai', model: this.openaiModel };
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'Network error calling OpenAI API');
        this.rotateOpenAIKey();
      }
    }
    return null;
  }

  /**
   * Assess a dark vessel detection and produce bounded adjustment and plain-language brief.
   */
  async assessCase(features, ruleScore) {
    if (!this.isConfigured()) {
      return this.generateFallback(features, ruleScore, 'No AI API keys configured');
    }

    const prompt = `
You are an expert maritime intelligence reasoning agent assisting Kenyan fisheries enforcement officers.
Analyze this satellite radar vessel detection that lacks an active AIS transponder signal in Kenya's Exclusive Economic Zone (EEZ).

OPERATIONAL TELEMETRY & COMPUTED FEATURES:
- Rule Baseline Score: ${ruleScore}/100
- Location: ${features.lat?.toFixed(4)}°N, ${features.lon?.toFixed(4)}°E (${features.locationLabel || 'Offshore Kenya'})
- Sector: ${features.sector || 'Open EEZ'}
- Distance to Shore/Port: ${features.distanceToCoastKm || 0} km from nearest Kenyan port (${features.nearestPort || 'Coast'})
- Distance to Outer EEZ Boundary: ${features.distanceToEEZBoundaryKm || 0} km
- Marine Protected Area (MPA): ${features.inMPA ? `INSIDE ${features.mpaName}` : `${features.distanceToMpaKm || 0} km from nearest MPA`}
- Recurrent Loitering Passes: ${features.recurrenceCount || 0} detections in 10 km radius over past 14 days
- Displacement Pattern: ${features.displacementPattern || 'Unknown'}
- AIS Coverage Reception Confidence: ${(features.aisCoverageConfidence * 100 || 85).toFixed(0)}%
- Nearby Fleet: ${features.nearbyAisVesselsCount || 0} active AIS fishing vessels within 20 km
- AIS Signal Gap Context: ${features.hasNearbyAisGap ? `Recent AIS gap event recorded ${features.aisGapDistanceKm} km away` : 'No recent AIS gap registered'}
- Estimated Vessel Length: ${features.estimatedLengthM ? `${features.estimatedLengthM} meters` : 'Unknown radar reflection'}
- Sea State: ${features.seaState || 'Moderate'} (Wave height: ${features.waveHeightM || 1.2}m, radar penalty: ${features.seaPenalty || 0} pts)

INSTRUCTIONS:
1. Provide a bounded score adjustment between -15 and +15 based strictly on situational nuance (e.g. proximity to MPA or border increases suspicion; rough seas or small craft length reduces certainty).
2. Write a 2-3 sentence tactical brief in plain, professional English citing only the facts provided above.
3. List 2 to 4 key factor strings.

RESPOND ONLY WITH VALID JSON matching this exact schema:
{
  "score_adjustment": number (-15 to 15),
  "rationale": "string (2-3 clear sentences)",
  "key_factors": ["factor 1", "factor 2"]
}
`;

    try {
      const response = await this.generate({ prompt, jsonMode: true });
      if (!response || !response.text) {
        return this.generateFallback(features, ruleScore, 'AI response unavailable');
      }

      let rawText = response.text.trim();
      if (rawText.startsWith('```json')) {
        rawText = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      } else if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```\s*/i, '').replace(/\s*```$/, '');
      }

      let parsed = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        // Regex extraction if LLM contained unescaped double quotes inside rationale string
        const scoreMatch = rawText.match(/"score_adjustment"\s*:\s*(-?\d+)/);
        const rationaleMatch = rawText.match(/"rationale"\s*:\s*"([\s\S]*?)"\s*,\s*"key_factors"/);
        const fallbackRationale = rawText.match(/"rationale"\s*:\s*"([\s\S]*?)"/);
        const factors = [];
        const factorsBlock = rawText.match(/"key_factors"\s*:\s*\[([\s\S]*?)\]/);
        if (factorsBlock) {
          const items = factorsBlock[1].match(/"([^"]+)"/g);
          if (items) {
            items.forEach((it) => factors.push(it.replace(/^"|"$/g, '')));
          }
        }
        parsed = {
          score_adjustment: scoreMatch ? parseInt(scoreMatch[1], 10) : 0,
          rationale: rationaleMatch ? rationaleMatch[1] : (fallbackRationale ? fallbackRationale[1] : 'Satellite radar contact lacking transponder broadcast.'),
          key_factors: factors,
        };
      }

      const validated = OutputSchema.parse({
        score_adjustment: Math.max(-15, Math.min(15, Math.round(parsed.score_adjustment ?? 0))),
        rationale: parsed.rationale || 'Radar target assessed in Kenya Exclusive Economic Zone.',
        key_factors: Array.isArray(parsed.key_factors) ? parsed.key_factors : [],
      });

      return {
        ...validated,
        source: `${response.provider} (${response.model})`,
      };
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed during LLM evaluation; activating fallback template');
      return this.generateFallback(features, ruleScore, err.message);
    }
  }

  generateFallback(features, ruleScore, reason = '') {
    const keyFactors = [];
    const sentences = [];

    sentences.push(
      `Radar contact detected at ${features.lat?.toFixed(3)}°, ${features.lon?.toFixed(3)}° without corresponding AIS broadcast.`
    );

    if (features.inMPA) {
      sentences.push(`Target is operating inside the ${features.mpaName || 'Marine Protected Area'}, where commercial trawling is strictly prohibited.`);
      keyFactors.push(`Inside MPA: ${features.mpaName}`);
    } else if (features.distanceToEEZBoundaryKm !== undefined && features.distanceToEEZBoundaryKm < 25) {
      sentences.push(`Vessel is hovering ${features.distanceToEEZBoundaryKm} km from the outer EEZ boundary, consistent with border-skirting incursions.`);
      keyFactors.push('Close to EEZ boundary');
    }

    if (features.recurrenceCount > 1) {
      sentences.push(`History shows ${features.recurrenceCount} recurrent satellite passes in this 10 km sector over the last 14 days, indicating persistent loitering.`);
      keyFactors.push(`Recurrent loitering (${features.recurrenceCount} passes)`);
    }

    if (features.hasNearbyAisGap) {
      sentences.push(`Corroborated by a recent AIS transponder gap recorded within ${features.aisGapDistanceKm || 5} km.`);
      keyFactors.push('Corroborated by AIS gap event');
    }

    if (features.distanceToCoastKm !== undefined && features.distanceToCoastKm < 10) {
      sentences.push(`Proximity to ${features.nearestPort || 'harbour'} (<10 km) suggests potential artisanal boat or anchorage.`);
      keyFactors.push('Near port / shallow coastal waters');
    }

    if (features.waveHeightM && features.waveHeightM > 2.5) {
      sentences.push(`High sea state (${features.waveHeightM}m waves) may contribute to radar clutter.`);
      keyFactors.push('Rough sea state clutter');
    }

    if (keyFactors.length === 0) {
      keyFactors.push('Unmatched radar return', 'No active AIS transponder');
    }

    return {
      score_adjustment: 0,
      rationale: sentences.slice(0, 3).join(' '),
      key_factors: keyFactors,
      source: 'deterministic fallback',
    };
  }
}

export const llmClient = new LLMClient();
export default llmClient;
