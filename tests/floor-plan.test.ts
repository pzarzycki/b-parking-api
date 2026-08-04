import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const schema = JSON.parse(readFileSync('specs/floor-plan.schema.json', 'utf8'));
const validate = new (Ajv2020 as unknown as { new (options: object): { compile(value: object): { (value: unknown): boolean; errors?: unknown[] } } })({ allErrors: true, strict: false }).compile(schema);

describe('canonical floor-plan v1 schema', () => {
  it('accepts the repository example', () => {
    const plan = YAML.parse(readFileSync('examples/garage-layout.yml', 'utf8'));
    expect(validate(plan), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects an obsolete features-only floor document', () => {
    expect(validate({ version: 1, garage: { id: 'garage', name: 'Garage' }, floors: [] })).toBe(false);
  });
});
