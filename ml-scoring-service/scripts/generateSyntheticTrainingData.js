const fs = require('fs');
const path = require('path');

const featureEngineer = require('../src/services/featureEngineer');

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(dayOffset, hour) {
  const d = new Date(Date.UTC(2025, 0, 1 + dayOffset, hour, randInt(0, 59), randInt(0, 59)));
  return d.toISOString();
}

function boolToNum(v) {
  return v ? 1 : 0;
}

function buildTransaction(i) {
  const highRiskCountries = ['NG', 'RU', 'CN', 'PK'];
  const mediumRiskCountries = ['BR', 'IN', 'ID', 'PH', 'UA'];
  const lowRiskCountries = ['SG', 'US', 'GB', 'AU', 'DE', 'FR', 'JP', 'CA'];

  const countryRoll = Math.random();
  let country;
  if (countryRoll < 0.08) country = randChoice(highRiskCountries);
  else if (countryRoll < 0.22) country = randChoice(mediumRiskCountries);
  else country = randChoice(lowRiskCountries);

  const amountBase = Math.random();
  let amount;
  if (amountBase < 0.70) amount = randFloat(1, 500);
  else if (amountBase < 0.92) amount = randFloat(500, 5000);
  else amount = randFloat(5000, 20000);

  amount = Math.round(amount * 100) / 100;

  const hour = randInt(0, 23);
  const currency = randChoice(['USD', 'EUR', 'GBP']);
  const cardType = randChoice(['visa', 'mastercard', 'amex']);

  return {
    id: `txn-${String(i).padStart(8, '0')}`,
    customerId: `cust-${String(randInt(1, 12000)).padStart(5, '0')}`,
    merchantId: `merch-${String(randInt(1, 2500)).padStart(4, '0')}`,
    amount,
    currency,
    cardType,
    deviceId: `dev-${String(randInt(1, 50000)).padStart(6, '0')}`,
    ipAddress: `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
    location: {
      country,
      city: `city-${randInt(1, 400)}`,
    },
    metadata: {
      channel: randChoice(['web', 'mobile', 'pos']),
      mcc: `${randInt(1000, 9999)}`,
    },
    createdAt: toIso(randInt(0, 364), hour),
  };
}

function buildRuleResults(transaction) {
  const amount = transaction.amount;
  const country = (transaction.location && transaction.location.country) || 'UNKNOWN';
  const ts = new Date(transaction.createdAt);
  const hour = ts.getUTCHours();

  const highRiskCountries = new Set(['NG', 'RU', 'CN', 'PK']);

  const velocityTxnHour = Math.max(0, Math.round(randFloat(0, 16) + (amount > 5000 ? 2 : 0) + (highRiskCountries.has(country) ? 2 : 0)));
  const velocityAmountHour = Math.max(0, Math.round(randFloat(0, 20000) + amount * randFloat(0.1, 1.8)));
  const velocityTxnDay = Math.max(0, Math.round(randFloat(0, 70) + velocityTxnHour * randFloat(0.8, 2.2)));

  const suspiciousAmount = amount >= 10000;
  const highAmount = amount >= 5000;
  const unusualTime = hour < 6;
  const geoHighRisk = highRiskCountries.has(country);

  let ruleScore = 0;
  const reasons = [];

  if (velocityTxnHour > 10) {
    ruleScore += 15;
    reasons.push('High velocity: transactions last hour');
  }
  if (velocityAmountHour > 10000) {
    ruleScore += 20;
    reasons.push('High velocity: amount last hour');
  }
  if (velocityTxnDay > 50) {
    ruleScore += 10;
    reasons.push('High velocity: transactions last day');
  }
  if (geoHighRisk) {
    ruleScore += 25;
    reasons.push('High risk country');
  }
  if (suspiciousAmount) {
    ruleScore += 30;
    reasons.push('Suspicious amount threshold exceeded');
  } else if (highAmount) {
    ruleScore += 10;
    reasons.push('High amount');
  }
  if (unusualTime) {
    ruleScore += 5;
    reasons.push('Unusual transaction time');
  }
  if (Math.round(amount) % 100 === 0 && amount >= 100) {
    ruleScore += 5;
    reasons.push('Round amount pattern');
  }

  ruleScore = Math.min(100, ruleScore);
  const flagged = ruleScore >= 50;

  return {
    flagged,
    ruleScore,
    reasons,
    riskFactors: {
      velocity: {
        customerTransactionsLastHour: velocityTxnHour,
        customerAmountLastHour: velocityAmountHour,
        customerTransactionsLastDay: velocityTxnDay,
      },
      geography: {
        country,
      },
      amount: {
        suspicious: suspiciousAmount,
        highAmount,
      },
      time: {
        unusualTime,
      },
    },
  };
}

function hiddenFraudProbability(txn, rr, feats) {
  let z = -4.2;

  z += 1.8 * boolToNum(rr.flagged);
  z += 1.2 * feats.amount_suspicious;
  z += 0.9 * feats.amount_high;
  z += 1.1 * feats.geo_high_risk;
  z += 0.7 * feats.time_unusual;
  z += 1.3 * feats.velocity_txn_hour_norm;
  z += 1.0 * feats.velocity_amount_hour_norm;
  z += 0.6 * feats.rules_score;
  z += 0.4 * feats.rules_reason_count;
  z += 0.25 * feats.amount_x_velocity;

  if (txn.cardType === 'amex') z += 0.15;
  if (txn.currency === 'USD') z -= 0.05;
  if (txn.location && txn.location.country === 'SG') z -= 0.2;

  const p = 1 / (1 + Math.exp(-z));
  return Math.min(0.995, Math.max(0.001, p));
}

function toCsvRow(obj, headers) {
  return headers.map((h) => {
    const v = obj[h];
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(',');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generate(count, outDir) {
  const rows = [];

  for (let i = 1; i <= count; i++) {
    const txn = buildTransaction(i);
    const rr = buildRuleResults(txn);
    const fd = featureEngineer.extract(txn, rr);
    featureEngineer.validate(fd);

    const pFraud = hiddenFraudProbability(txn, rr, fd.features);
    const isFraud = Math.random() < pFraud ? 1 : 0;

    const finalDecision = isFraud ? 'DECLINED' : 'APPROVED';

    const row = {
      transaction_id: txn.id,
      customer_id: txn.customerId,
      merchant_id: txn.merchantId,
      scored_at: txn.createdAt,
      amount: txn.amount,
      currency: txn.currency,
      card_type: txn.cardType,
      country: txn.location.country,
      hour_utc: new Date(txn.createdAt).getUTCHours(),

      rule_flagged: boolToNum(rr.flagged),
      rule_score: rr.ruleScore,
      rule_reasons_count: rr.reasons.length,
      velocity_txn_hour_raw: rr.riskFactors.velocity.customerTransactionsLastHour,
      velocity_amount_hour_raw: rr.riskFactors.velocity.customerAmountLastHour,
      velocity_txn_day_raw: rr.riskFactors.velocity.customerTransactionsLastDay,
      geo_country_high_risk: boolToNum(['NG', 'RU', 'CN', 'PK'].includes(txn.location.country)),
      amount_suspicious_raw: boolToNum(rr.riskFactors.amount.suspicious),
      amount_high_raw: boolToNum(rr.riskFactors.amount.highAmount),
      unusual_time_raw: boolToNum(rr.riskFactors.time.unusualTime),

      model_feature_version: fd.featureVersion,
      model_feature_count: fd.featureCount,

      label_is_fraud: isFraud,
      label_source: 'synthetic_manual_review',
      final_decision: finalDecision,
    };

    for (const [k, v] of Object.entries(fd.features)) {
      row[`f_${k}`] = typeof v === 'number' ? Number(v.toFixed(6)) : v;
    }

    rows.push(row);

    if (i % 20000 === 0) {
      process.stdout.write(`Generated ${i}/${count}\n`);
    }
  }

  shuffle(rows);

  const headers = Object.keys(rows[0]);
  const fullPath = path.join(outDir, 'synthetic_training_full.csv');
  const trainPath = path.join(outDir, 'synthetic_training_train.csv');
  const valPath = path.join(outDir, 'synthetic_training_val.csv');
  const testPath = path.join(outDir, 'synthetic_training_test.csv');

  const trainN = Math.floor(rows.length * 0.70);
  const valN = Math.floor(rows.length * 0.15);
  const train = rows.slice(0, trainN);
  const val = rows.slice(trainN, trainN + valN);
  const test = rows.slice(trainN + valN);

  const writeCsv = (p, data) => {
    const lines = [headers.join(',')];
    for (const r of data) lines.push(toCsvRow(r, headers));
    fs.writeFileSync(p, `${lines.join('\n')}\n`, 'utf8');
  };

  writeCsv(fullPath, rows);
  writeCsv(trainPath, train);
  writeCsv(valPath, val);
  writeCsv(testPath, test);

  const fraudCount = rows.reduce((acc, r) => acc + r.label_is_fraud, 0);
  const summary = {
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    fraudRows: fraudCount,
    nonFraudRows: rows.length - fraudCount,
    fraudRate: Number((fraudCount / rows.length).toFixed(4)),
    files: {
      full: fullPath,
      train: trainPath,
      val: valPath,
      test: testPath,
    },
  };

  fs.writeFileSync(path.join(outDir, 'synthetic_training_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  return summary;
}

function main() {
  const count = Number(process.argv[2] || 100000);
  const outDir = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(__dirname, '..', 'data', 'synthetic');

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Row count must be a positive integer');
  }

  fs.mkdirSync(outDir, { recursive: true });

  const summary = generate(count, outDir);
  console.log(JSON.stringify(summary, null, 2));
}

main();
