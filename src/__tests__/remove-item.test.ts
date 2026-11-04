import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest } from '../spec/resolve.js';
import { loadToolSpecs } from '../spec/loader.js';
import { routeZeroQuantity, RAW_RESPONSE_PARAM } from '../spec/register.js';
import { TOOL_CATALOG } from '../spec/catalog.js';

const { specs } = loadToolSpecs();
const spec = (name: string) => {
  const s = specs.find((x) => x.name === name);
  assert.ok(s, name);
  return s;
};
const line = { ean: '3083681040609', basketServiceId: '0999-999-999', subBasketType: 'drive_clcv' };

test('remove_item_from_cart sends the website call: flat PATCH /api/cart/items, no quantity', () => {
  const req = buildRequest(spec('remove_item_from_cart'), line);
  assert.equal(req.method, 'PATCH');
  assert.equal(req.url, 'https://www.carrefour.fr/api/cart/items');
  assert.deepEqual(JSON.parse(String(req.body)), {
    trackingRequest: { pageType: 'basket', pageId: 'basket' },
    ...line,
  });
});

test('remove_item_from_cart is a cart write, idempotent', () => {
  assert.deepEqual(TOOL_CATALOG.remove_item_from_cart, { toolset: 'cart', kind: 'write', idempotent: true });
});

test('add_item_to_cart with counter 0 is routed to remove_item_from_cart', () => {
  const routed = routeZeroQuantity(
    spec('add_item_to_cart'),
    { ...line, counter: 0, pageType: 'search', [RAW_RESPONSE_PARAM]: true },
    specs
  );
  assert.equal(routed.spec.name, 'remove_item_from_cart');
  assert.deepEqual(routed.args, { ...line, [RAW_RESPONSE_PARAM]: true });
});

test('a negative quantity is a removal too', () => {
  assert.equal(routeZeroQuantity(spec('add_item_to_cart'), { ...line, counter: -1 }, specs).spec.name, 'remove_item_from_cart');
});

test('a non-zero quantity and other tools are left alone', () => {
  const add = spec('add_item_to_cart');
  assert.equal(routeZeroQuantity(add, { ...line, counter: 2 }, specs).spec, add);
  const other = spec('get_cart');
  assert.equal(routeZeroQuantity(other, { counter: 0 }, specs).spec, other);
});
