#!/usr/bin/env node

import fs from "node:fs";

const HELP = `Usage:
  node scripts/calculate_performance_score.mjs --pcp-ms <milliseconds> [metadata]
  node scripts/calculate_performance_score.mjs --input-json <path>
  node scripts/calculate_performance_score.mjs --runs-json <path> [metadata]

Metadata:
  --source <name>
  --result-type <field_aggregate|reporter_single|synthetic_lab>
  --environment <name>
  --aggregation <P75|P50|arithmetic_mean|upstream_standard>
  --window <label>
  --sample-count <integer>
  --uncertainty-ms <milliseconds>
`;

function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {};
  const valueFlags = new Set([
    "--pcp-ms",
    "--input-json",
    "--runs-json",
    "--source",
    "--result-type",
    "--environment",
    "--aggregation",
    "--window",
    "--sample-count",
    "--uncertainty-ms",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      result.help = true;
      continue;
    }
    if (!valueFlags.has(token)) fail(`unknown option: ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`missing value for ${token}`);
    }
    result[token.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  return result;
}

function toFiniteNonNegative(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
  return parsed;
}

function calculateScore(pcpMs) {
  if (pcpMs <= 1000) return 10;
  if (pcpMs <= 1500) return 10 - (pcpMs - 1000) / 250;
  if (pcpMs <= 5500) return 8 - (pcpMs - 1500) / 500;
  return 0;
}

function ratingFor(score) {
  if (score < 5) return "差";
  if (score < 7) return "中";
  if (score < 8.5) return "优";
  return "卓越";
}

function formulaFor(pcpMs) {
  if (pcpMs <= 1000) return "10";
  if (pcpMs <= 1500) return `10 - (${pcpMs} - 1000) / 250`;
  if (pcpMs <= 5500) return `8 - (${pcpMs} - 1500) / 500`;
  return "0";
}

function roundOne(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function normalizeRaw(value) {
  return Number(value.toFixed(12));
}

function parseSampleCount(value) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("sample_count must be a non-negative integer");
  }
  return parsed;
}

function parseResultType(value) {
  if (value === undefined) return undefined;
  const allowed = new Set(["field_aggregate", "reporter_single", "synthetic_lab"]);
  if (!allowed.has(value)) {
    throw new Error("result_type must be field_aggregate, reporter_single, or synthetic_lab");
  }
  return value;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function calculateRecord(record, inheritedMetadata = {}) {
  const sourceValue = record?.pcp_ms ?? record?.pcpMs;
  const pcpMs = toFiniteNonNegative(sourceValue, "pcp_ms");
  const scoreRaw = Math.max(0, Math.min(10, calculateScore(pcpMs)));
  const recordSampleCount =
    record?.sample_count === undefined
      ? inheritedMetadata.sample_count
      : parseSampleCount(record.sample_count);
  const metadata = {
    source: record?.source ?? inheritedMetadata.source,
    result_type: parseResultType(record?.result_type ?? inheritedMetadata.result_type),
    environment: record?.environment ?? inheritedMetadata.environment,
    aggregation: record?.aggregation ?? inheritedMetadata.aggregation,
    window: record?.window ?? inheritedMetadata.window,
    sample_count: recordSampleCount,
    uncertainty_ms:
      record?.uncertainty_ms === undefined && inheritedMetadata.uncertainty_ms === undefined
        ? undefined
        : toFiniteNonNegative(
            record?.uncertainty_ms ?? inheritedMetadata.uncertainty_ms,
            "uncertainty_ms",
          ),
  };

  return {
    ...(record?.name ? { name: record.name } : {}),
    pcp_ms: pcpMs,
    score_raw: normalizeRaw(scoreRaw),
    score: roundOne(scoreRaw),
    rating: ratingFor(scoreRaw),
    formula: formulaFor(pcpMs),
    ...Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined),
    ),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  const inputModes = [args.pcp_ms, args.input_json, args.runs_json].filter(
    (value) => value !== undefined,
  ).length;
  if (inputModes !== 1) {
    fail("provide exactly one of --pcp-ms, --input-json, or --runs-json");
  }

  try {
    const metadata = {
      source: args.source,
      result_type: parseResultType(args.result_type),
      environment: args.environment,
      aggregation: args.aggregation,
      window: args.window,
      sample_count: parseSampleCount(args.sample_count),
      uncertainty_ms:
        args.uncertainty_ms === undefined
          ? undefined
          : toFiniteNonNegative(args.uncertainty_ms, "uncertainty_ms"),
    };

    if (args.pcp_ms !== undefined) {
      const output = calculateRecord({ pcp_ms: args.pcp_ms }, metadata);
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      return;
    }

    if (args.runs_json !== undefined) {
      const parsed = JSON.parse(fs.readFileSync(args.runs_json, "utf8"));
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("runs JSON must be a non-empty array");
      }
      const runsMs = parsed.map((item, index) => {
        try {
          return toFiniteNonNegative(
            typeof item === "object" && item !== null
              ? item.pcp_ms ?? item.pcpMs
              : item,
            `runs[${index}]`,
          );
        } catch (error) {
          throw new Error(`item ${index}: ${error.message}`);
        }
      });
      const pcpMs = median(runsMs);
      const output = calculateRecord(
        { pcp_ms: pcpMs },
        {
          ...metadata,
          aggregation: metadata.aggregation ?? "median",
          sample_count: metadata.sample_count ?? runsMs.length,
        },
      );
      const spreadRatio = pcpMs === 0
        ? (Math.max(...runsMs) === 0 ? 0 : null)
        : (Math.max(...runsMs) - Math.min(...runsMs)) / pcpMs;
      process.stdout.write(`${JSON.stringify({
        ...output,
        runs_ms: runsMs,
        spread_ratio: spreadRatio === null ? null : normalizeRaw(spreadRatio),
        high_variance: spreadRatio === null || spreadRatio > 0.3,
      }, null, 2)}\n`);
      return;
    }

    const parsed = JSON.parse(fs.readFileSync(args.input_json, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("input JSON must be an array");
    const results = parsed.map((record, index) => {
      try {
        return calculateRecord(record, metadata);
      } catch (error) {
        throw new Error(`item ${index}: ${error.message}`);
      }
    });
    process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
  } catch (error) {
    fail(error.message);
  }
}

main();
