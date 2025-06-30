import { pgTable, uuid, timestamp, varchar, integer, decimal, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { shares } from './shares';

export const llmCosts = pgTable('llm_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id').references(() => shares.id, { onDelete: 'set null' }),
  modelName: varchar('model_name', { length: 50 }).notNull(),
  provider: varchar('provider', { length: 20 }).notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  totalTokens: integer('total_tokens').generatedAlwaysAs(
    sql`input_tokens + output_tokens`
  ),
  inputCostUsd: decimal('input_cost_usd', { precision: 10, scale: 6 }).notNull(),
  outputCostUsd: decimal('output_cost_usd', { precision: 10, scale: 6 }).notNull(),
  totalCostUsd: decimal('total_cost_usd', { precision: 10, scale: 6 }).generatedAlwaysAs(
    sql`input_cost_usd + output_cost_usd`
  ),
  backend: varchar('backend', { length: 20 }).notNull().default('api'),
  processingTimeMs: integer('processing_time_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => {
  return {
    // Indexes
    createdAtIdx: index('idx_llm_costs_created_at').on(table.createdAt),
    modelNameIdx: index('idx_llm_costs_model_name').on(table.modelName),
    providerIdx: index('idx_llm_costs_provider').on(table.provider),
    backendIdx: index('idx_llm_costs_backend').on(table.backend),
    shareIdIdx: index('idx_llm_costs_share_id').on(table.shareId),
    
    // Check constraints
    inputTokensPositive: check('chk_input_tokens_positive', sql`input_tokens > 0`),
    outputTokensPositive: check('chk_output_tokens_positive', sql`output_tokens >= 0`),
    inputCostPositive: check('chk_input_cost_positive', sql`input_cost_usd >= 0`),
    outputCostPositive: check('chk_output_cost_positive', sql`output_cost_usd >= 0`),
    backendValid: check('chk_backend_valid', sql`backend IN ('api', 'local')`),
    providerValid: check('chk_provider_valid', sql`provider IN ('openai', 'anthropic', 'local')`)
  };
});

// Type definitions
export type LLMProvider = 'openai' | 'anthropic' | 'local';
export type LLMBackend = 'api' | 'local';

export interface LLMCostRecord {
  shareId?: string;
  modelName: string;
  provider: LLMProvider;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  backend: LLMBackend;
  processingTimeMs?: number;
}

// Model pricing configuration (cents per 1K tokens)
export const LLM_PRICING = {
  openai: {
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 }
  },
  anthropic: {
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
    'claude-2.1': { input: 0.008, output: 0.024 },
    'claude-instant-1.2': { input: 0.00163, output: 0.00551 }
  }
} as const;

// Helper function to calculate cost
export function calculateLLMCost(
  provider: LLMProvider,
  model: string,
  inputTokens: number,
  outputTokens: number
): { inputCost: number; outputCost: number; totalCost: number } {
  // Handle local provider (no cost)
  if (provider === 'local') {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0
    };
  }
  
  // Get pricing for API providers
  let inputRate = 0;
  let outputRate = 0;
  
  if (provider === 'openai') {
    const modelPricing = LLM_PRICING.openai[model as keyof typeof LLM_PRICING.openai];
    if (modelPricing) {
      inputRate = modelPricing.input;
      outputRate = modelPricing.output;
    } else {
      throw new Error(`Unknown OpenAI model: ${model}`);
    }
  } else if (provider === 'anthropic') {
    const modelPricing = LLM_PRICING.anthropic[model as keyof typeof LLM_PRICING.anthropic];
    if (modelPricing) {
      inputRate = modelPricing.input;
      outputRate = modelPricing.output;
    } else {
      throw new Error(`Unknown Anthropic model: ${model}`);
    }
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  const inputCost = (inputTokens / 1000) * inputRate;
  const outputCost = (outputTokens / 1000) * outputRate;
  
  return {
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat((inputCost + outputCost).toFixed(6))
  };
}