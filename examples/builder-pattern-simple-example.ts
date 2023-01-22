import { AppEx } from '../src';

const id = 'a44be02c-8c2f-4be0-9c16-7258ba707bc8';

try {
  throw AppEx.new(`Could not fetch a resource with id {{id}}`)
    .numCode(404)
    .code('RESOURCE_NOT_FOUND')
    .details({ id });
} catch (caught: unknown) {
  console.log((caught as any).toJSON());
}
