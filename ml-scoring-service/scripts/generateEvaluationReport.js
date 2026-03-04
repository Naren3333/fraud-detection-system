const fs = require('fs');
const path = require('path');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }

  out.push(cur);
  return out;
}

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const lines = raw.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const vals = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = vals[j];
    }
    rows.push(row);
  }

  return rows;
}

function sigmoid(x) {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

function aucRoc(yTrue, yScore) {
  const pairs = yTrue.map((y, i) => ({ y, s: yScore[i] }));
  pairs.sort((a, b) => a.s - b.s);

  let rankSumPos = 0;
  let nPos = 0;
  let nNeg = 0;

  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) {
      rankSumPos += i + 1;
      nPos++;
    } else {
      nNeg++;
    }
  }

  if (nPos === 0 || nNeg === 0) return 0.5;
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function metricsAtThreshold(yTrue, probs, threshold) {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (let i = 0; i < yTrue.length; i++) {
    const actual = yTrue[i];
    const pred = probs[i] >= threshold ? 1 : 0;
    if (pred === 1 && actual === 1) tp++;
    else if (pred === 0 && actual === 0) tn++;
    else if (pred === 1 && actual === 0) fp++;
    else fn++;
  }

  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(1e-12, precision + recall);
  const accuracy = (tp + tn) / Math.max(1, yTrue.length);
  const falsePositiveRate = fp / Math.max(1, fp + tn);

  return {
    threshold: Number(threshold.toFixed(2)),
    tp,
    fp,
    tn,
    fn,
    precision: Number(precision.toFixed(6)),
    recall: Number(recall.toFixed(6)),
    f1: Number(f1.toFixed(6)),
    accuracy: Number(accuracy.toFixed(6)),
    falsePositiveRate: Number(falsePositiveRate.toFixed(6)),
  };
}

function toFeatureVector(row, featureNames, model) {
  return featureNames.map((name) => {
    const raw = Number(row[`f_${name}`] ?? row[name] ?? 0);
    const mean = Number(model.normalizer?.mean?.[name] ?? 0);
    const std = Number(model.normalizer?.std?.[name] ?? 1) || 1;
    return (raw - mean) / std;
  });
}

function toDecisionBand(prob, approveMax, declineMin) {
  const score = Math.round(prob * 100);
  if (score <= approveMax) return 'APPROVED';
  if (score >= declineMin) return 'DECLINED';
  return 'FLAGGED';
}

function buildTriageImpact(yTrue, probs, approveMax, declineMin) {
  const impact = {
    APPROVED: { count: 0, fraudCount: 0 },
    FLAGGED: { count: 0, fraudCount: 0 },
    DECLINED: { count: 0, fraudCount: 0 },
  };

  for (let i = 0; i < yTrue.length; i++) {
    const band = toDecisionBand(probs[i], approveMax, declineMin);
    impact[band].count += 1;
    if (yTrue[i] === 1) impact[band].fraudCount += 1;
  }

  return ['APPROVED', 'FLAGGED', 'DECLINED'].map((band) => {
    const row = impact[band];
    const fraudRate = row.fraudCount / Math.max(1, row.count);
    return {
      decisionBand: band,
      count: row.count,
      fraudCount: row.fraudCount,
      fraudRate: Number(fraudRate.toFixed(6)),
      sharePct: Number(((row.count / Math.max(1, yTrue.length)) * 100).toFixed(2)),
    };
  });
}

function markdownTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${head}\n${divider}\n${body}`;
}

function run() {
  const root = path.resolve(__dirname, '..');
  const modelPath = process.argv[2] || path.join(root, 'data', 'models', 'latest', 'model.json');
  const testPath = process.argv[3] || path.join(root, 'data', 'synthetic', 'synthetic_training_test.csv');
  const outDir = process.argv[4] || path.join(root, 'data', 'models', 'latest');
  const approveMax = Number(process.argv[5] || 40);
  const declineMin = Number(process.argv[6] || 70);

  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
  const rows = readCsv(testPath);
  const featureNames = model.featureNames || Object.keys(model.weights || {});
  const weights = featureNames.map((f) => Number(model.weights?.[f] || 0));
  const bias = Number(model.intercept || 0);

  const yTrue = rows.map((r) => Number(r.label_is_fraud || 0));
  const probs = rows.map((r) => {
    const x = toFeatureVector(r, featureNames, model);
    return sigmoid(dot(weights, x) + bias);
  });

  const auc = Number(aucRoc(yTrue, probs).toFixed(6));
  const selectedThreshold = Number((model.threshold || 0.5).toFixed(2));
  const coreMetrics = metricsAtThreshold(yTrue, probs, selectedThreshold);
  const thresholdSweep = [];

  for (let t = 0.1; t <= 0.9; t += 0.05) {
    thresholdSweep.push(metricsAtThreshold(yTrue, probs, t));
  }

  thresholdSweep.sort((a, b) => b.f1 - a.f1);
  const topTradeoffs = thresholdSweep.slice(0, 8);
  const triageImpact = buildTriageImpact(yTrue, probs, approveMax, declineMin);

  const report = {
    generatedAt: new Date().toISOString(),
    modelPath,
    testPath,
    sampleCount: rows.length,
    selectedThreshold,
    rocAuc: auc,
    confusionMatrix: {
      truePositive: coreMetrics.tp,
      falsePositive: coreMetrics.fp,
      trueNegative: coreMetrics.tn,
      falseNegative: coreMetrics.fn,
    },
    metrics: {
      precision: coreMetrics.precision,
      recall: coreMetrics.recall,
      f1: coreMetrics.f1,
      accuracy: coreMetrics.accuracy,
      falsePositiveRate: coreMetrics.falsePositiveRate,
    },
    thresholdTradeoffs: topTradeoffs,
    triageConfig: {
      approveMaxScore: approveMax,
      declineMinScore: declineMin,
    },
    triageImpact,
  };

  const summaryTable = markdownTable(
    ['Metric', 'Value'],
    [
      ['Precision', report.metrics.precision],
      ['Recall', report.metrics.recall],
      ['F1', report.metrics.f1],
      ['Accuracy', report.metrics.accuracy],
      ['False Positive Rate', report.metrics.falsePositiveRate],
      ['ROC-AUC', report.rocAuc],
      ['Threshold', report.selectedThreshold],
    ]
  );

  const confusionTable = markdownTable(
    ['Actual \\ Predicted', 'Fraud(1)', 'Legit(0)'],
    [
      ['Fraud(1)', report.confusionMatrix.truePositive, report.confusionMatrix.falseNegative],
      ['Legit(0)', report.confusionMatrix.falsePositive, report.confusionMatrix.trueNegative],
    ]
  );

  const tradeoffTable = markdownTable(
    ['Threshold', 'Precision', 'Recall', 'F1', 'FPR', 'TP', 'FP', 'TN', 'FN'],
    report.thresholdTradeoffs.map((m) => [
      m.threshold,
      m.precision,
      m.recall,
      m.f1,
      m.falsePositiveRate,
      m.tp,
      m.fp,
      m.tn,
      m.fn,
    ])
  );

  const triageTable = markdownTable(
    ['Decision Band', 'Count', 'Share %', 'Fraud Count', 'Fraud Rate'],
    report.triageImpact.map((r) => [
      r.decisionBand,
      r.count,
      r.sharePct,
      r.fraudCount,
      r.fraudRate,
    ])
  );

  const markdown = [
    '# Offline Model Evaluation Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Model: \`${modelPath}\``,
    `Dataset: \`${testPath}\` (${report.sampleCount} rows)`,
    '',
    '## Core Metrics',
    '',
    summaryTable,
    '',
    '## Confusion Matrix',
    '',
    confusionTable,
    '',
    '## Threshold Tradeoff (Top by F1)',
    '',
    tradeoffTable,
    '',
    `## Approve/Flag/Decline Impact (Approve <= ${approveMax}, Decline >= ${declineMin})`,
    '',
    triageTable,
    '',
  ].join('\n');

  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'evaluation.json');
  const mdPath = path.join(outDir, 'evaluation.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, markdown, 'utf8');

  console.log(JSON.stringify({
    jsonPath,
    mdPath,
    selectedThreshold: report.selectedThreshold,
    rocAuc: report.rocAuc,
    precision: report.metrics.precision,
    recall: report.metrics.recall,
    f1: report.metrics.f1,
  }, null, 2));
}

run();
