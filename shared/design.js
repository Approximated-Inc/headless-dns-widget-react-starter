export const designOptions = [
  { id: 'simple', label: 'Simple', description: 'A straightforward setup, with everything in one place.' },
  { id: 'dashboard', label: 'Dashboard', description: 'A compact workspace for managing your DNS records.' },
  { id: 'guided', label: 'Guided', description: 'A little more guidance, from your domain to a verified DNS record.' }
];

export function nextDesign(current, key) {
  const index = designOptions.findIndex((option) => option.id === current);
  if (key === 'Home') return designOptions[0].id;
  if (key === 'End') return designOptions[designOptions.length - 1].id;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const offset = key === 'ArrowRight' ? 1 : -1;
  return designOptions[(index + offset + designOptions.length) % designOptions.length].id;
}

// Prepared instructions are not proof that someone saved a DNS change.
export function guidedSteps(state) {
  const prepared = Boolean(state.result);
  const complete = state.phase === 'complete';
  const checking = state.phase === 'checking';
  const attempted = checking || Boolean(state.check) || state.error?.operation === 'verify';
  return [
    {
      state: prepared ? 'complete' : 'current',
      caption: prepared ? 'Instructions received for your domain' : state.phase === 'loading' ? 'Finding your DNS provider' : 'Start with the address you want to connect'
    },
    {
      state: complete ? 'complete' : prepared && !attempted ? 'current' : 'waiting',
      caption: complete ? 'Your DNS records match the requested values' : prepared ? 'Your DNS setup options are ready below' : 'Your exact record values will appear here'
    },
    {
      state: complete ? 'complete' : prepared && attempted ? 'current' : 'waiting',
      caption: complete ? 'DNS match confirmed' : checking ? 'Looking up your DNS records' : attempted ? 'Review the latest check below' : 'Check after saving your changes at your DNS provider'
    }
  ];
}
