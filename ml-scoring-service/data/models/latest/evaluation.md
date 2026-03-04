# Offline Model Evaluation Report

Generated: 2026-03-04T14:56:14.201Z
Model: `C:\Users\Naren\Documents\SMU\y2s2\ESD\project\fraud-detection-system\ml-scoring-service\data\models\latest\model.json`
Dataset: `C:\Users\Naren\Documents\SMU\y2s2\ESD\project\fraud-detection-system\ml-scoring-service\data\synthetic\synthetic_training_test.csv` (15000 rows)

## Core Metrics

| Metric | Value |
| --- | --- |
| Precision | 0.730463 |
| Recall | 0.607965 |
| F1 | 0.663608 |
| Accuracy | 0.907133 |
| False Positive Rate | 0.039796 |
| ROC-AUC | 0.843884 |
| Threshold | 0.49 |

## Confusion Matrix

| Actual \ Predicted | Fraud(1) | Legit(0) |
| --- | --- | --- |
| Fraud(1) | 1374 | 886 |
| Legit(0) | 507 | 12233 |

## Threshold Tradeoff (Top by F1)

| Threshold | Precision | Recall | F1 | FPR | TP | FP | TN | FN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.45 | 0.726128 | 0.612389 | 0.664426 | 0.040973 | 1384 | 522 | 12218 | 876 |
| 0.4 | 0.721184 | 0.614602 | 0.663641 | 0.042151 | 1389 | 537 | 12203 | 871 |
| 0.5 | 0.731343 | 0.60708 | 0.663443 | 0.03956 | 1372 | 504 | 12236 | 888 |
| 0.35 | 0.716564 | 0.616372 | 0.662702 | 0.04325 | 1393 | 551 | 12189 | 867 |
| 0.3 | 0.711597 | 0.619027 | 0.662092 | 0.044505 | 1399 | 567 | 12173 | 861 |
| 0.55 | 0.733587 | 0.59823 | 0.65903 | 0.03854 | 1352 | 491 | 12249 | 908 |
| 0.25 | 0.694799 | 0.626549 | 0.658911 | 0.048823 | 1416 | 622 | 12118 | 844 |
| 0.6 | 0.746635 | 0.564602 | 0.642983 | 0.033987 | 1276 | 433 | 12307 | 984 |

## Approve/Flag/Decline Impact (Approve <= 40, Decline >= 70)

| Decision Band | Count | Share % | Fraud Count | Fraud Rate |
| --- | --- | --- | --- | --- |
| APPROVED | 13077 | 87.18 | 871 | 0.066605 |
| FLAGGED | 661 | 4.41 | 381 | 0.576399 |
| DECLINED | 1262 | 8.41 | 1008 | 0.798732 |
