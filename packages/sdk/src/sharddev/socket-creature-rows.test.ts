import { expect, test } from 'vitest';
import { parse } from 'valibot';
import { SocketRigCreatureSchema } from '@wildshard/format/socketRigCreature';
import { socketRigCreatureRows } from './species';

const input = { model: { id: 'author-creature/deer', file: 'models/deer.ts', pipeline: ['code'], surface: 'wood' },
  product: 'author-creature', sockets: 'combat/deer.json', kind: 'deer',
  coat: { id: 'normal', label: 'Normal', weight: 1, rarity: 'common', scale: [1, 1], hp: 12,
    tint: { body: [0.1, 0.2, 0.3] }, traits: { antlers: true } } };

test('author creature cards retain all native model, socket, coat and rig fields', () => {
  expect(socketRigCreatureRows(input)).toEqual(parse(SocketRigCreatureSchema, input));
});

test('author creature cards retain finite, tuple and executable refusals', () => {
  for (const invalid of [{ ...input, callback: () => undefined }, { ...input, coat: { ...input.coat, scale: [1] } },
    { ...input, coat: { ...input.coat, tint: { body: [0, Number.NaN, 1] } } }]) {
    expect(() => socketRigCreatureRows(invalid)).toThrow();
    expect(() => parse(SocketRigCreatureSchema, invalid)).toThrow();
  }
});
