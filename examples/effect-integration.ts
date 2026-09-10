import { Effect } from 'effect';
import { defineException } from '../src';

const SearchFailed = defineException({
  tag: 'agent/SearchFailed',
  message: ({ query }: { query: string }) => `Search failed for ${query}`,
});

export function runEffectExample(): Promise<string> {
  const cause = new Error('search service unavailable');
  const failure = Effect.fail(
    new SearchFailed({
      details: { query: 'Ada' },
      cause,
    }),
  );
  const program = Effect.catchTag(failure, 'agent/SearchFailed', (error) =>
    Effect.succeed(`Recovered ${error._tag} for query ${error.details.query}`),
  );
  return Effect.runPromise(program);
}

if (require.main === module) {
  runEffectExample().then((message) => process.stdout.write(`${message}\n`));
}
