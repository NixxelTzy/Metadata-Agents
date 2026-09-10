import {
  optimizeMetadata,
  extractVisualFeatures,
  rankKeywords,
  classifyCategory,
  scoreMetadata,
  globalMachineCache,
  getStemKey,
  normalizeKeyword,
  isInvalidKeyword,
  expandConcepts,
  buildEnhancedPromptResult,
} from "@/MACHINE";

describe("MACHINE Intelligence Engine Test Suite", () => {
  describe("Semantic Engine & Porter Stemmer", () => {
    it("should correctly stem words and prevent duplicate morphological stems", () => {
      expect(getStemKey("running")).toBe(getStemKey("run"));
      expect(getStemKey("flowering")).toBe(getStemKey("flowers"));
    });

    it("should filter out banned spam and trademark terms while allowing commercial tags", () => {
      expect(isInvalidKeyword("nike")).toBe(true);
      expect(isInvalidKeyword("apple")).toBe(true);
      expect(isInvalidKeyword("watermark")).toBe(true);
      expect(isInvalidKeyword("best")).toBe(true);
      expect(isInvalidKeyword("copy space")).toBe(false);
      expect(isInvalidKeyword("isolated")).toBe(false);
    });

    it("should normalize and harmonize UK to US spellings", () => {
      expect(normalizeKeyword("cosy colour")).toBe("cozy color");
      expect(normalizeKeyword("theatre centre")).toBe("theater center");
    });

    it("should expand concepts with buyer-intent tags", () => {
      const expanded = expandConcepts(["coffee"], 5);
      expect(expanded.length).toBeGreaterThan(0);
      expect(expanded.some(t => t.includes("espresso") || t.includes("caffeine") || t.includes("beverage"))).toBe(true);
    });
  });

  describe("Feature Extractor", () => {
    it("should extract photographic visual features and copy space suitability", () => {
      const features = extractVisualFeatures(
        "A golden hour sunset over a serene mountain lake with a solitary pine tree and copy space on the right",
        "landscape, outdoor",
        "Sunset over mountain lake"
      );

      expect(features.colorTemperature).toBe("warm");
      expect(features.lightingStyle).toContain("golden hour");
      expect(features.composition).toBeDefined();
      expect(features.detectedObjects).toEqual(expect.arrayContaining(["sunset", "mountain", "lake", "tree"]));
      expect(features.copySpaceSuitability?.hasCopySpace).toBe(true);
    });
  });

  describe("Keyword Ranker (Okapi BM25+)", () => {
    it("should rank, score, and deduplicate keywords using BM25+ and buyer intent", () => {
      const candidates = [
        "sunset", "sunsets", "sunsetting", "mountain", "mountains",
        "lake", "lakes", "pine tree", "copy space", "isolated",
        "nature", "outdoor", "serene", "tranquil", "golden hour",
        "beautiful", "best", "hd", "nike", "water", "fresh"
      ];
      const result = rankKeywords(candidates, "sunset mountain lake pine tree copy space nature outdoor serene", 49);

      expect(result.rankedKeywords.length).toBeLessThanOrEqual(49);
      expect(result.prunedCount).toBeGreaterThan(0);
      // All items must have distinct stem keys
      const stems = result.rankedKeywords.map(k => getStemKey(k));
      const uniqueStems = new Set(stems);
      expect(uniqueStems.size).toBe(stems.length);
      // Top keywords must include key commercial and visual terms
      expect(result.rankedKeywords).toEqual(expect.arrayContaining(["sunset", "mountain", "lake", "copy space"]));
    });
  });

  describe("Category Predictor (Dual Taxonomy)", () => {
    it("should predict categories for both Adobe Stock and Shutterstock", () => {
      const features = extractVisualFeatures("Sunset landscape over mountain and forest", "nature");
      const keywords = ["sunset", "landscape", "mountain", "forest", "nature", "outdoor"];

      const adobe = classifyCategory(keywords, features, "Mountain Sunset Landscape", "adobe_stock");
      const shutter = classifyCategory(keywords, features, "Mountain Sunset Landscape", "shutterstock");

      expect(adobe.primaryCategory).toBeDefined();
      expect(adobe.confidence).toBeGreaterThan(0.6);
      expect(shutter.primaryCategory).toBe("Nature");
      expect(shutter.confidence).toBeGreaterThan(0.6);
    });
  });

  describe("Generative Prompt Enhancer", () => {
    it("should compile high-fidelity camera rigs, lighting, and model parameters", () => {
      const features = extractVisualFeatures("Macro detail of water droplet on fresh green leaf", "macro, closeup");
      const result = buildEnhancedPromptResult({
        title: "Water droplet on leaf",
        visualFeatures: features,
        targetModel: "Midjourney 6",
        aspectRatio: "16:9",
      });

      expect(result.targetModel).toBe("Midjourney 6");
      expect(result.enhancedPrompt).toContain("--v 6.1");
      expect(result.enhancedPrompt).toContain("--ar 16:9");
      expect(result.cameraSettings).toContain("Macro");
      expect(result.negativePrompts.length).toBeGreaterThan(5);
    });
  });

  describe("Confidence Scorer", () => {
    it("should compute overall quality score and simplicity index", () => {
      const features = extractVisualFeatures("Serene modern office workplace with laptop and copy space");
      const keywords = [
        "office", "modern", "workplace", "business", "laptop", "computer",
        "copy space", "isolated", "desk", "indoor", "professional", "success"
      ];

      const score = scoreMetadata(
        "Modern corporate office workplace with laptop and copy space",
        keywords,
        features,
        keywords.length
      );

      expect(score.overallScore).toBeGreaterThanOrEqual(70);
      expect(score.accuracyConfidence).toBeGreaterThanOrEqual(0.85);
      expect(score.simplicityIndex).toBeGreaterThan(0);
      expect(score.diversityIndex).toBeGreaterThan(0.7);
      expect(score.details.passedChecks.length).toBeGreaterThan(0);
    });
  });

  describe("Machine Cache Engine", () => {
    it("should perform exact and fuzzy cache matching", () => {
      globalMachineCache.set("A serene sunset over a mountain lake with pine tree", { cached: true });

      const exact = globalMachineCache.get("A serene sunset over a mountain lake with pine tree");
      expect(exact).toEqual({ cached: true });

      const fuzzy = globalMachineCache.get("A serene sunset over mountain lake with pine trees");
      expect(fuzzy).toEqual({ cached: true });

      const stats = globalMachineCache.getStats();
      expect(stats.hits).toBeGreaterThanOrEqual(2);
      expect(stats.fuzzyHits).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Master Optimizer Pipeline", () => {
    it("should run full end-to-end optimization meeting exact keyword count constraints", () => {
      const result = optimizeMetadata({
        title: "Sunset mountain lake",
        keywords: ["sunset", "mountain", "lake", "water", "tree", "nature"],
        visualDescription: "Golden hour sunset over calm mountain lake with solitary pine tree",
        platform: "adobe_stock",
        filename: "lake_sunset_001.jpg",
      });

      expect(result.title.length).toBeGreaterThan(10);
      expect(result.keywords.length).toBe(49); // Strict Adobe Stock requirement
      expect(result.categories.length).toBeGreaterThanOrEqual(2);
      expect(result.qualityMetrics.overallScore).toBeGreaterThan(75);
      expect(result.mlInsights.aiModelUsed).toBe("MACHINE-ML-Cognitive-v2");
      expect(result.mlInsights.reasoningChain?.length).toBeGreaterThan(5);
    });
  });
});
