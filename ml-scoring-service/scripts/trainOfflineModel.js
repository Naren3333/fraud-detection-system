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
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function aucRoc(yTrue, yScore) {
  const pairs = yTrue.map((y, i) => ({ y, s: yScore[i] }));
  pairs.sort((a, b) => a.s - b.s);

  let rankSumPos = 0;
  let nPos = 0;
  let nNeg = 0;

  for (let i = 0; i < pairs.length; i++) {
    const y = pairs[i].y;
    if (y === 1) {
      rankSumPos += i + 1;
      nPos += 1;
    } else {
      nNeg += 1;
    }
  }

  if (nPos === 0 || nNeg === 0) return 0.5;
  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function classificationMetrics(yTrue, probs, threshold) {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (let i = 0; i < yTrue.length; i++) {
    const y = yTrue[i];
    const pred = probs[i] >= threshold ? 1 : 0;

    if (pred === 1 && y === 1) tp++;
    else if (pred === 0 && y === 0) tn++;
    else if (pred === 1 && y === 0) fp++;
    else if (pred === 0 && y === 1) fn++;
  }

  const accuracy = (tp + tn) / Math.max(1, yTrue.length);
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(1e-12, precision + recall);

  return { tp, tn, fp, fn, accuracy, precision, recall, f1 };
}

function bestThreshold(yTrue, probs) {
  let best = { threshold: 0.5, f1: -1 };

  for (let t = 0.05; t <= 0.95; t += 0.01) {
    const m = classificationMetrics(yTrue, probs, t);
    if (m.f1 > best.f1) {
      best = { threshold: Number(t.toFixed(2)), f1: m.f1, metrics: m };
    }
  }

  return best;
}

function toDataset(rows, featureNames) {
  const X = rows.map((r) => featureNames.map((f) => Number(r[f] || 0)));
  const y = rows.map((r) => Number(r.label_is_fraud || 0));
  return { X, y };
}

function standardize(X) {
  const n = X.length;
  const p = X[0].length;
  const mean = Array(p).fill(0);
  const std = Array(p).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) mean[j] += X[i][j];
  }
  for (let j = 0; j < p; j++) mean[j] /= n;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      const d = X[i][j] - mean[j];
      std[j] += d * d;
    }
  }
  for (let j = 0; j < p; j++) {
    std[j] = Math.sqrt(std[j] / Math.max(1, n - 1));
    if (std[j] < 1e-9) std[j] = 1;
  }

  const Z = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  return { Z, mean, std };
}

function applyStandardize(X, mean, std) {
  return X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
}

function trainLogReg(X, y, opts = {}) {
  const n = X.length;
  const p = X[0].length;
  const epochs = opts.epochs || 250;
  const lr = opts.learningRate || 0.04;
  const l2 = opts.l2 || 0.0005;

  const w = Array(p).fill(0);
  let b = 0;

  for (let ep = 0; ep < epochs; ep++) {
    const gw = Array(p).fill(0);
    let gb = 0;

    for (let i = 0; i < n; i++) {
      const z = dot(w, X[i]) + b;
      const pHat = sigmoid(z);
      const err = pHat - y[i];

      for (let j = 0; j < p; j++) gw[j] += err * X[i][j];
      gb += err;
    }

    for (let j = 0; j < p; j++) {
      gw[j] = gw[j] / n + l2 * w[j];
      w[j] -= lr * gw[j];
    }
    b -= lr * (gb / n);
  }

  return { weights: w, bias: b, epochs, learningRate: lr, l2 };
}

function predictProbs(X, w, b) {
  return X.map((row) => sigmoid(dot(w, row) + b));
}

function roundObj(obj, digits = 6) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'number' ? Number(v.toFixed(digits)) : v;
  }
  return out;
}

function run() {
  const root = path.resolve(__dirname, '..');
  const trainPath = process.argv[2] || path.join(root, 'data', 'synthetic', 'synthetic_training_train.csv');
  const valPath = process.argv[3] || path.join(root, 'data', 'synthetic', 'synthetic_training_val.csv');
  const testPath = process.argv[4] || path.join(root, 'data', 'synthetic', 'synthetic_training_test.csv');
  const outDir = process.argv[5] || path.join(root, 'data', 'models', 'latest');

  const trainRows = readCsv(trainPath);
  const valRows = readCsv(valPath);
  const testRows = readCsv(testPath);

  if (!trainRows.length || !valRows.length || !testRows.length) {
    throw new Error('Input CSV files must be non-empty');
  }

  const featureNames = Object.keys(trainRows[0]).filter((k) => k.startsWith('f_')).sort();
  if (!featureNames.length) {
    throw new Error('No feature columns found (expected prefix f_)');
  }

  const trainDs = toDataset(trainRows, featureNames);
  const valDs = toDataset(valRows, featureNames);
  const testDs = toDataset(testRows, featureNames);

  const { Z: XTrain, mean, std } = standardize(trainDs.X);
  const XVal = applyStandardize(valDs.X, mean, std);
  const XTest = applyStandardize(testDs.X, mean, std);

  const model = trainLogReg(XTrain, trainDs.y, {
    epochs: 300,
    learningRate: 0.05,
    l2: 0.0008,
  });

  const trainProb = predictProbs(XTrain, model.weights, model.bias);
  const valProb = predictProbs(XVal, model.weights, model.bias);
  const testProb = predictProbs(XTest, model.weights, model.bias);

  const best = bestThreshold(valDs.y, valProb);
  const threshold = best.threshold;

  const trainMetrics = classificationMetrics(trainDs.y, trainProb, threshold);
  const valMetrics = classificationMetrics(valDs.y, valProb, threshold);
  const testMetrics = classificationMetrics(testDs.y, testProb, threshold);

  const trainAuc = aucRoc(trainDs.y, trainProb);
  const valAuc = aucRoc(valDs.y, valProb);
  const testAuc = aucRoc(testDs.y, testProb);

  const weightsByFeature = {};
  for (let i = 0; i < featureNames.length; i++) {
    weightsByFeature[featureNames[i].replace(/^f_/, '')] = model.weights[i];
  }

  const artifact = {
    modelVersion: `logreg-offline-${new Date().toISOString().slice(0, 10)}`,
    modelType: 'logistic_regression',
    trainedAt: new Date().toISOString(),
    featureVersion: '2.1.0',
    featureNames: featureNames.map((n) => n.replace(/^f_/, '')),
    normalizer: {
      mean: roundObj(Object.fromEntries(featureNames.map((n, i) => [n.replace(/^f_/, ''), mean[i]]))),
      std: roundObj(Object.fromEntries(featureNames.map((n, i) => [n.replace(/^f_/, ''), std[i]]))),
    },
    weights: roundObj(weightsByFeature),
    intercept: Number(model.bias.toFixed(6)),
    threshold,
    trainingConfig: {
      epochs: model.epochs,
      learningRate: model.learningRate,
      l2: model.l2,
    },
    metrics: {
      train: {
        ...roundObj(trainMetrics, 6),
        auc: Number(trainAuc.toFixed(6)),
      },
      val: {
        ...roundObj(valMetrics, 6),
        auc: Number(valAuc.toFixed(6)),
      },
      test: {
        ...roundObj(testMetrics, 6),
        auc: Number(testAuc.toFixed(6)),
      },
    },
    dataset: {
      trainRows: trainRows.length,
      valRows: valRows.length,
      testRows: testRows.length,
      labelColumn: 'label_is_fraud',
      positiveClass: 1,
    },
  };

  fs.mkdirSync(outDir, { recursive: true });
  const artifactPath = path.join(outDir, 'model.json');
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');

  console.log(JSON.stringify({ artifactPath, metrics: artifact.metrics, threshold }, null, 2));
}

run();
