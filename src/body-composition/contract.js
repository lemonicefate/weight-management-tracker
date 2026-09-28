export const BODY_COMPOSITION_ADAPTER_CONTRACT = Object.freeze({
  version: '1',
  requiredMethods: Object.freeze(['health', 'synchronize', 'listCandidates', 'getMeasurement'])
});

export function assertBodyCompositionAdapter(adapter) {
  const missing = BODY_COMPOSITION_ADAPTER_CONTRACT.requiredMethods.filter(
    (method) => typeof adapter?.[method] !== 'function'
  );
  if (missing.length) throw new TypeError('Body Composition Adapter is missing required methods: ' + missing.join(', '));
  return adapter;
}
