const { getModelDetail, loadLlmStatsKey } = await import('./dist/services/llm-stats.js');
const key = await loadLlmStatsKey();
console.log('Key loaded:', !!key);
if (key) {
  const detail = await getModelDetail(key, 'claude-sonnet-4.6');
  console.log('Result for claude-sonnet-4.6:', detail ? detail.id + ' - ' + detail.name : 'null');
  if (detail) {
    console.log('Scores:', detail.scores?.length || 0);
    console.log('Org:', detail.organization?.name);
  }
}
