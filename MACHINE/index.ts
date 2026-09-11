/**
 * MACHINE/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MACHINE Intelligence Engine — Microstock Metadata Optimization Suite
 * High-accuracy algorithmic pipeline for Adobe Stock, Shutterstock & Magnific.
 *
 * PIPELINE:
 *  1. buildKeywordPool / buildKeywordPoolWithAI → 500 candidates (1-2 words, relevant)
 *  2. rankKeywords / rankKeywordsWithAI         → select 49/50 for platform metadata
 *  3. optimizeMetadata / optimizeMetadataWithAI → full output with keywordPool exposed
 * ─────────────────────────────────────────────────────────────────────────────
 */

export * from "./types";
export * from "./feature-extractor";
export * from "./semantic-engine";
export * from "./keyword-ranker";
export * from "./category-predictor";
export * from "./confidence-scorer";
export * from "./prompt-enhancer";
export * from "./cache-engine";
export * from "./title-optimizer";
export * from "./optimizer";
