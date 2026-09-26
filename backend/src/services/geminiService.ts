import { GoogleGenAI, Type } from '@google/genai';

// ── Model fallback chain ──────────────────────────────────────────────────────

const MODELS = [
  { name: 'gemini-3.6-flash',      apiKey: process.env.GEMINI_KEY_FLASH      ?? '' },
  { name: 'gemini-3.6-flash-lite', apiKey: process.env.GEMINI_KEY_FLASH_LITE ?? '' },
  { name: 'gemini-3.5-flash-lite',   apiKey: process.env.GEMINI_KEY_FLASH_LITE2   ?? '' },
] as const;

// ── Response schema ───────────────────────────────────────────────────────────

export const IMPACT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    severity: {
      type: Type.STRING,
      enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      description: 'Overall severity of the proposed change',
      nullable: false,
    },
    severityScore: {
      type: Type.NUMBER,
      description: 'Numeric severity score from 1 to 100',
      nullable: false,
    },
    summary: {
      type: Type.STRING,
      description: 'One-paragraph plain-English summary of the impact',
      nullable: false,
    },
    affectedFiles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          filePath:        { type: Type.STRING, nullable: false },
          callSite:        { type: Type.STRING, nullable: false },
          breakageReason:  { type: Type.STRING, nullable: false },
          isBreakingChange:{ type: Type.BOOLEAN, nullable: false },
        },
        required: ['filePath', 'callSite', 'breakageReason', 'isBreakingChange'],
      },
      description: 'Files that are affected by the proposed change',
      nullable: false,
    },
    suggestedSafeFix: {
      type: Type.STRING,
      description: 'Unified diff or code block explaining a safe migration path',
      nullable: false,
    },
  },
  required: ['severity', 'severityScore', 'summary', 'affectedFiles', 'suggestedSafeFix'],
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AffectedFile {
  filePath: string;
  callSite: string;
  breakageReason: string;
  isBreakingChange: boolean;
}

export interface ImpactResponse {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  severityScore: number;
  summary: string;
  affectedFiles: AffectedFile[];
  suggestedSafeFix: string;
}

// Custom error classes for structured upstream handling
export class RateLimitExhaustedError extends Error {
  constructor() {
    super('All Gemini models are rate-limited. Please try again later.');
    this.name = 'RateLimitExhaustedError';
  }
}

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

// ── callGeminiWithFallback ────────────────────────────────────────────────────

/**
 * Calls Gemini with a three-model fallback chain.
 * Falls through to the next model ONLY on 429 rate-limit errors.
 * All other errors throw a GeminiError immediately.
 */
export async function callGeminiWithFallback(prompt: string): Promise<ImpactResponse> {
  let lastError: unknown;

  for (const model of MODELS) {
    if (!model.apiKey) continue; // skip unconfigured models

    try {
      const ai = new GoogleGenAI({ apiKey: model.apiKey });

      const response = await ai.models.generateContent({
        model: model.name,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: IMPACT_RESPONSE_SCHEMA,
        },
      });

      const text = response.text ?? '';
      return JSON.parse(text) as ImpactResponse;

    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      const status = e?.status;
      const msg = e?.message ?? String(err);

      // 429 → try next model
      if (status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate')) {
        lastError = err;
        continue;
      }

      // Any other Gemini error → fail immediately
      throw new GeminiError(`Gemini error (${model.name}): ${msg}`);
    }
  }

  // All models exhausted on 429
  if (lastError) throw new RateLimitExhaustedError();

  // No model was configured at all
  throw new GeminiError('No Gemini API keys are configured. Set GEMINI_KEY_FLASH in backend/.env');
}
