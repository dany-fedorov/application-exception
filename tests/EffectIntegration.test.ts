import { runEffectExample } from '../examples/effect-integration';

test('a typed exception participates in Effect catchTag through Effect.fail', async () => {
  await expect(runEffectExample()).resolves.toBe(
    'Recovered agent/SearchFailed for query Ada',
  );
});
