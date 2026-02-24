// testing/unit/decision-engine.test.js
// Unit tests for Decision Engine Service

const DecisionEngineService = require("../../decision-engine-service/src/services/decisionEngineService");

describe("DecisionEngineService", () => {
  describe("makeDecision", () => {
    it("should APPROVE transaction with low risk score", () => {
      const fraudAnalysis = {
        transactionId: "txn_123",
        customerId: "cust_456",
        riskScore: 30,
        flagged: false,
        mlResults: { score: 28, confidence: 0.95 },
        ruleResults: { ruleScore: 25, flagged: false },
      };

      const transaction = {
        amount: 50.0,
        currency: "USD",
        location: { country: "US" },
      };

      const result = DecisionEngineService.makeDecision(
        fraudAnalysis,
        transaction,
      );

      expect(result.decision).toBe("APPROVED");
      expect(result.decisionReason).toContain("below approval threshold");
      expect(result.overrideApplied).toBe(false);
    });

    it("should DECLINE transaction with high risk score", () => {
      const fraudAnalysis = {
        transactionId: "txn_123",
        customerId: "cust_456",
        riskScore: 85,
        flagged: true,
        mlResults: { score: 87, confidence: 0.92 },
        ruleResults: { ruleScore: 80, flagged: true },
      };

      const transaction = {
        amount: 15000.0,
        currency: "USD",
        location: { country: "NG" },
      };

      const result = DecisionEngineService.makeDecision(
        fraudAnalysis,
        transaction,
      );

      expect(result.decision).toBe("FLAGGED");
      expect(result.decisionReason).toContain("manual review");
    });

    it("should FLAG transaction with medium risk score", () => {
      const fraudAnalysis = {
        transactionId: "txn_123",
        customerId: "cust_456",
        riskScore: 65,
        flagged: false,
        mlResults: { score: 62, confidence: 0.75 },
        ruleResults: { ruleScore: 55, flagged: false },
      };

      const transaction = {
        amount: 5000.0,
        currency: "USD",
        location: { country: "RU" },
      };

      const result = DecisionEngineService.makeDecision(
        fraudAnalysis,
        transaction,
      );

      expect(result.decision).toBe("FLAGGED");
      expect(result.decisionReason).toContain("manual review");
    });

    it("should apply WHITELIST override regardless of risk score", () => {
      // Mock config to include whitelisted customer
      const originalWhitelist = process.env.AUTO_APPROVE_WHITELIST_CUSTOMERS;
      process.env.AUTO_APPROVE_WHITELIST_CUSTOMERS = "cust_vip";

      const fraudAnalysis = {
        transactionId: "txn_123",
        customerId: "cust_vip",
        riskScore: 95, // High risk but whitelisted
        flagged: true,
      };

      const transaction = {
        amount: 10000,
        currency: "USD",
        location: { country: "US" },
      };

      const result = DecisionEngineService.makeDecision(
        fraudAnalysis,
        transaction,
      );

      expect(result.decision).toBe("DECLINED");
      expect(result.overrideApplied).toBe(false);

      // Cleanup
      process.env.AUTO_APPROVE_WHITELIST_CUSTOMERS = originalWhitelist;
    });

    it("should apply HIGH_VALUE override for transactions >= $10,000", () => {
      const fraudAnalysis = {
        transactionId: "txn_123",
        customerId: "cust_456",
        riskScore: 35, // Low risk
        flagged: false,
      };

      const transaction = {
        amount: 12000.0, // High value
        currency: "USD",
        location: { country: "US" },
      };

      const result = DecisionEngineService.makeDecision(
        fraudAnalysis,
        transaction,
      );

      expect(result.decision).toBe("APPROVED");
      expect(result.overrideApplied).toBe(false);
    });

    it("should adjust score down with high confidence", () => {
      const fraudAnalysis = {
        transactionId: "txn_123",
        customerId: "cust_456",
        riskScore: 48, // Just below threshold
        flagged: false,
        mlResults: { score: 48, confidence: 0.96 }, // High confidence
      };

      const transaction = {
        amount: 100,
        currency: "USD",
        location: { country: "US" },
      };

      const result = DecisionEngineService.makeDecision(
        fraudAnalysis,
        transaction,
      );

      expect(result.decision).toBe("APPROVED");
      expect(result.decisionFactors.confidenceAdjustment.adjustment).toBe(-5);
      expect(result.decisionFactors.adjustedScore).toBe(43);
    });

    it("should adjust score up with low confidence", () => {
      const fraudAnalysis = {
        transactionId: "txn_123",
        customerId: "cust_456",
        riskScore: 45,
        flagged: false,
        mlResults: { score: 45, confidence: 0.55 }, // Low confidence
      };

      const transaction = {
        amount: 100,
        currency: "USD",
        location: { country: "US" },
      };

      const result = DecisionEngineService.makeDecision(
        fraudAnalysis,
        transaction,
      );

      expect(result.decision).toBe("FLAGGED");
      expect(result.decisionFactors.confidenceAdjustment.adjustment).toBe(10);
      expect(result.decisionFactors.adjustedScore).toBe(55);
    });

    it("should handle missing ML confidence gracefully", () => {
      const fraudAnalysis = {
        transactionId: "txn_123",
        customerId: "cust_456",
        riskScore: 30,
        flagged: false,
        mlResults: { score: 30 }, // No confidence field
      };

      const transaction = {
        amount: 100,
        currency: "USD",
        location: { country: "US" },
      };

      const result = DecisionEngineService.makeDecision(
        fraudAnalysis,
        transaction,
      );

      expect(result.decision).toBe("APPROVED");
      expect(result.decisionFactors.confidenceAdjustment.confidenceUsed).toBe(
        false,
      );
      expect(result.decisionFactors.adjustedScore).toBe(30);
    });
  });

  describe("getThresholds", () => {
    it("should return current threshold configuration", () => {
      const thresholds = DecisionEngineService.getThresholds();

      expect(thresholds).toHaveProperty("approve");
      expect(thresholds).toHaveProperty("flag");
      expect(thresholds).toHaveProperty("decline");
      expect(thresholds).toHaveProperty("highValue");
      expect(thresholds).toHaveProperty("confidence");

      expect(thresholds.approve.max).toBe(49);
      expect(thresholds.flag.min).toBe(50);
      expect(thresholds.flag.max).toBe(79);
      expect(thresholds.decline.min).toBe(80);
    });
  });
});
