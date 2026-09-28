export function weightSummary(baselineWeight, currentWeight) {
  if (!(baselineWeight > 0) || !(currentWeight > 0)) {
    return { changeKg: null, lossPercent: null };
  }
  const change = currentWeight - baselineWeight;
  return {
    changeKg: Math.round(change * 100) / 100,
    lossPercent: Math.round(((baselineWeight - currentWeight) / baselineWeight) * 10000) / 100
  };
}

export function roundMetric(value) {
  return value === null || value === undefined ? null : Math.round(value * 100) / 100;
}
