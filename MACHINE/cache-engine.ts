/**
 * MACHINE/cache-engine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Intelligent Multi-Tier LRU/LFU Hybrid Cache Engine with Fuzzy Similarity Matching.
 * Provides microsecond-level retrieval for repeated and near-identical visual prompts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getStemKey } from "./semantic-engine";

interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  lastAccessed: number;
  hitCount: number;
  tokenSet: Set<string>;
}

export interface CacheStatistics {
  hits: number;
  misses: number;
  hitRatio: number;
  totalEntries: number;
  evictions: number;
  fuzzyHits: number;
}

export class MachineCache<T> {
  private store: Map<string, CacheEntry<T>> = new Map();
  private maxEntries: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private fuzzyHits = 0;

  constructor(maxEntries = 300, ttlMinutes = 90) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  /**
   * Generates a 64-bit FNV-1a hash key for high-speed deterministic indexing.
   */
  private generateExactKey(rawInput: string): string {
    const normalized = rawInput.toLowerCase().trim().replace(/\s+/g, " ");
    let hash = 0x811c9dc5;
    for (let i = 0; i < normalized.length; i++) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `mc_${(hash >>> 0).toString(36)}`;
  }

  /**
   * Tokenizes input into stemmed alphanumeric shingles for fuzzy similarity comparison.
   */
  private extractTokens(input: string): Set<string> {
    const words = input
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2);
    return new Set(words.map(w => getStemKey(w)));
  }

  /**
   * Computes Jaccard similarity coefficient between two token sets (0.0 to 1.0).
   */
  private computeJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Retrieves an item from cache. Checks exact match first; if not found,
   * performs a fuzzy scan for high similarity (>= 0.75 Jaccard overlap).
   */
  get(input: string, fuzzyThreshold = 0.75): T | null {
    const now = Date.now();
    const exactKey = this.generateExactKey(input);
    const exactEntry = this.store.get(exactKey);

    // Exact Match Hit
    if (exactEntry) {
      if (now - exactEntry.timestamp > this.ttlMs) {
        this.store.delete(exactKey);
        this.misses++;
        return null;
      }
      exactEntry.lastAccessed = now;
      exactEntry.hitCount++;
      this.hits++;
      // Move to back for LRU
      this.store.delete(exactKey);
      this.store.set(exactKey, exactEntry);
      return exactEntry.value;
    }

    // Fuzzy Match Lookup for Near-Identical Descriptions
    const inputTokens = this.extractTokens(input);
    if (inputTokens.size >= 4) {
      let bestMatch: CacheEntry<T> | null = null;
      let highestSimilarity = 0;

      for (const entry of this.store.values()) {
        if (now - entry.timestamp > this.ttlMs) continue;
        const similarity = this.computeJaccardSimilarity(inputTokens, entry.tokenSet);
        if (similarity >= fuzzyThreshold && similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = entry;
        }
      }

      if (bestMatch) {
        bestMatch.lastAccessed = now;
        bestMatch.hitCount++;
        this.hits++;
        this.fuzzyHits++;
        return bestMatch.value;
      }
    }

    this.misses++;
    return null;
  }

  /**
   * Stores an item with intelligent hybrid eviction (scores frequency + recency).
   */
  set(input: string, value: T): void {
    const key = this.generateExactKey(input);
    const now = Date.now();

    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.evictLeastValuable();
    }

    const tokenSet = this.extractTokens(input);
    this.store.set(key, {
      key,
      value,
      timestamp: now,
      lastAccessed: now,
      hitCount: 1,
      tokenSet,
    });
  }

  /**
   * Evicts the entry with the lowest combined utility score:
   * Utility = (hitCount * 1.5) - ((now - lastAccessed) / 60000)
   */
  private evictLeastValuable(): void {
    const now = Date.now();
    let leastValuableKey: string | null = null;
    let lowestScore = Infinity;

    for (const [k, entry] of this.store.entries()) {
      // Immediate eviction if expired
      if (now - entry.timestamp > this.ttlMs) {
        this.store.delete(k);
        this.evictions++;
        return;
      }

      const idleMinutes = (now - entry.lastAccessed) / 60000;
      const utilityScore = (entry.hitCount * 2.0) - idleMinutes;

      if (utilityScore < lowestScore) {
        lowestScore = utilityScore;
        leastValuableKey = k;
      }
    }

    if (leastValuableKey) {
      this.store.delete(leastValuableKey);
      this.evictions++;
    } else {
      // Fallback: evict oldest inserted entry
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
        this.evictions++;
      }
    }
  }

  /**
   * Returns complete telemetry diagnostics.
   */
  getStats(): CacheStatistics {
    const totalRequests = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRatio: totalRequests > 0 ? Number((this.hits / totalRequests).toFixed(3)) : 0,
      totalEntries: this.store.size,
      evictions: this.evictions,
      fuzzyHits: this.fuzzyHits,
    };
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.fuzzyHits = 0;
  }

  size(): number {
    return this.store.size;
  }
}

// Global shared cache instance with 400 slots and 2-hour TTL
export const globalMachineCache = new MachineCache<any>(400, 120);
