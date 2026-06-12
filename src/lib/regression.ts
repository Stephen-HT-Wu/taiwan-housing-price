/** 簡易 OLS 多元線性迴歸（含標準化係數與 partial R²） */

export interface RegressionResult {
  coefficients: number[];
  r2: number;
  adjR2: number;
  n: number;
  variableNames: string[];
}

function transpose(m: number[][]): number[][] {
  return m[0].map((_, i) => m.map((row) => row[i]));
}

function matMul(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const out = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      for (let j = 0; j < cols; j++) {
        out[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return out;
}

function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) return null;
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];

    const div = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= div;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row.slice(n));
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v) || 1;
}

export function olsRegression(
  y: number[],
  X: number[][],
  variableNames: string[],
): RegressionResult | null {
  const n = y.length;
  const p = X[0]?.length ?? 0;
  if (n < p + 2) return null;

  const design = X.map((row) => [1, ...row]);
  const yCol = y.map((v) => [v]);
  const xt = transpose(design);
  const xtx = matMul(xt, design);
  const xtxInv = invertMatrix(xtx);
  if (!xtxInv) return null;

  const xty = matMul(xt, yCol);
  const beta = matMul(xtxInv, xty).map((row) => row[0]);

  const yHat = design.map((row) =>
    row.reduce((s, v, i) => s + v * beta[i], 0),
  );
  const yBar = mean(y);
  const ssRes = y.reduce((s, yi, i) => s + (yi - yHat[i]) ** 2, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - yBar) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const adjR2 = 1 - ((1 - r2) * (n - 1)) / (n - p - 1);

  return {
    coefficients: beta,
    r2,
    adjR2,
    n,
    variableNames: ['const', ...variableNames],
  };
}

export function correlationMatrix(
  columns: Record<string, number[]>,
): Record<string, Record<string, number>> {
  const keys = Object.keys(columns);
  const out: Record<string, Record<string, number>> = {};
  for (const a of keys) {
    out[a] = {};
    for (const b of keys) {
      const xs = columns[a];
      const ys = columns[b];
      const mx = mean(xs);
      const my = mean(ys);
      let num = 0;
      let dx = 0;
      let dy = 0;
      for (let i = 0; i < xs.length; i++) {
        const vx = xs[i] - mx;
        const vy = ys[i] - my;
        num += vx * vy;
        dx += vx * vx;
        dy += vy * vy;
      }
      out[a][b] = dx && dy ? num / Math.sqrt(dx * dy) : 0;
    }
  }
  return out;
}

export interface VariableImportance {
  id: string;
  label: string;
  coefficient: number;
  stdCoefficient: number;
  partialR2: number;
}

export function analyzeExplanatoryPower(
  y: number[],
  X: number[][],
  variableIds: string[],
  variableLabels: string[],
): {
  model: RegressionResult;
  importance: VariableImportance[];
} | null {
  const full = olsRegression(y, X, variableIds);
  if (!full) return null;

  const yStd = std(y);
  const importance: VariableImportance[] = variableIds.map((id, j) => {
    const reducedX = X.map((row) => row.filter((_, idx) => idx !== j));
    const reducedIds = variableIds.filter((_, idx) => idx !== j);
    const reduced = olsRegression(y, reducedX, reducedIds);
    const partialR2 =
      reduced && reduced.r2 < full.r2
        ? (full.r2 - reduced.r2) / (1 - reduced.r2)
        : 0;

    return {
      id,
      label: variableLabels[j],
      coefficient: full.coefficients[j + 1],
      stdCoefficient: (full.coefficients[j + 1] * std(X.map((r) => r[j]))) / yStd,
      partialR2: Math.max(0, partialR2),
    };
  });

  return { model: full, importance };
}
