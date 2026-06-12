/** 繪圖用數值範圍，上下留邊距 */
export function valueExtent(
  values: number[],
  paddingRatio = 0.08,
): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [0, 1];
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || Math.max(Math.abs(max), 1) * 0.1 || 1;
  return [min - span * paddingRatio, max + span * paddingRatio];
}

export function valueToY(
  v: number,
  min: number,
  max: number,
  plotTop: number,
  plotBottom: number,
): number {
  const span = max - min || 1;
  return plotBottom - ((v - min) / span) * (plotBottom - plotTop);
}

export function formatAxisTick(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function seriesToPath(
  values: number[],
  startIdx: number,
  n: number,
  toX: (i: number) => number,
  toY: (v: number) => number,
): string {
  const segments: string[] = [];
  let chunk: string[] = [];
  for (let i = startIdx; i < n; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      if (chunk.length > 0) {
        segments.push(`M ${chunk.join(' L ')}`);
        chunk = [];
      }
      continue;
    }
    chunk.push(`${toX(i)},${toY(v)}`);
  }
  if (chunk.length > 0) segments.push(`M ${chunk.join(' L ')}`);
  return segments.join(' ');
}

export function axisTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  const span = max - min;
  if (span === 0) return [min];
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}
