export type NormalizeSlotExpressionResult =
  | { status: "applied"; expression: string }
  | { status: "alias-missing" }
  | { status: "already-normalized" };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatScalarLiteral(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return Number(value.toFixed(4)).toString();
}

export function buildPiecewiseNormalizeSnippet(
  alias: string,
  outputMin: number,
  outputMid: number,
  outputMax: number,
): string {
  const formattedMin = formatScalarLiteral(outputMin);
  const formattedMid = formatScalarLiteral(outputMid);
  const formattedMax = formatScalarLiteral(outputMax);
  return `piecewise_remap(${alias}, vec(-1, 0, 1), vec(${formattedMin}, ${formattedMid}, ${formattedMax}))`;
}

export function normalizeSlotExpression(opts: {
  expression?: string | null;
  alias: string;
  snippet: string;
}): NormalizeSlotExpressionResult {
  const alias = opts.alias.trim();
  if (!alias) {
    return { status: "alias-missing" };
  }
  const snippet = opts.snippet.trim();
  if (!snippet) {
    return { status: "alias-missing" };
  }
  const currentExpression = (opts.expression ?? "").trim();
  const piecewisePattern = new RegExp(
    `piecewise_remap\\s*\\(\\s*${escapeRegExp(alias)}\\s*(?:,|\\))`,
    "i",
  );
  if (piecewisePattern.test(currentExpression)) {
    return { status: "already-normalized" };
  }
  if (currentExpression.length === 0) {
    return { status: "applied", expression: snippet };
  }
  const aliasBoundary = `\\b${escapeRegExp(alias)}\\b`;
  const aliasPattern = new RegExp(aliasBoundary);
  if (!aliasPattern.test(currentExpression)) {
    return { status: "alias-missing" };
  }
  const aliasReplacePattern = new RegExp(aliasBoundary, "g");
  const nextExpression = currentExpression.replace(
    aliasReplacePattern,
    snippet,
  );
  if (nextExpression === currentExpression) {
    return { status: "alias-missing" };
  }
  return { status: "applied", expression: nextExpression };
}
