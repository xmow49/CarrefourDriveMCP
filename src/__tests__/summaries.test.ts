import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, summarizeCart } from '../spec/summaries.js';
import { render } from '../spec/register.js';
import { cartPayload } from './fixtures/cart.fixture.js';

const clone = () => structuredClone(cartPayload) as any;

test('cart summary lists every line with quantity, EAN and price paid', () => {
  const s = summarizeCart(cartPayload)!;
  assert.match(s, /1 × Pâte Feuilletée Pur Beurre CARREFOUR ORIGINAL, le paquet de 230g \(EAN 3270190204008\): 1\.19 €/);
  assert.match(s, /\(EAN 3083681040609\): 1\.24 € \(was 1\.65 €, −0\.41 €\) — promo "1 acheté = 25% de remise"/);
  assert.match(s, /\(EAN 3560070150403\): 4\.79 € \(\+0\.20 € on loyalty card\)/);
  assert.match(s, /\(EAN 8723400944171\): 2\.59 € — promo available, not applied: "Le 2ème à -50%"/);
  assert.match(s, /\[Charcuterie et Traiteur\]/);
});

test('cart summary carries totals, minimum order, fees and the slot in Paris time', () => {
  const s = summarizeCart(cartPayload)!;
  assert.match(s, /basketServiceId 0999-999-999: 4 products \(4 units\), 0 unavailable/);
  assert.match(s, /Total to pay: 11\.56 € \(products 10\.22 € − discounts 0\.41 € \+ fees 1\.75 €\)/);
  assert.match(s, /Fees detail: 5 bags × 0\.35 €/);
  assert.match(s, /Minimum order not reached: 5\.60 € missing/);
  // 07:00 UTC on 5 November is 08:00 in Paris (winter time).
  assert.match(s, /Slot: not booked \(default proposal 05\/11\/2026 08:00–08:30 \(Europe\/Paris\)\)/);
});

test('cart summary is a small fraction of the payload', () => {
  const s = summarizeCart(cartPayload)!;
  assert.ok(s.length < 1500, `summary is ${s.length} chars`);
  assert.doesNotMatch(s, /media\.carrefour\.fr|REDACTED/);
});

test('cart summary flags unavailable and out-of-stock lines and foreign basket services', () => {
  const data = clone();
  const line = data.cart.items[0].products[0];
  line.available = false;
  line.isStockOff = true;
  line.product.attributes.offerServiceId = '0001-001-001';
  assert.match(summarizeCart(data)!, /1\.19 € — UNAVAILABLE — OUT OF STOCK — basketServiceId 0001-001-001/);
});

test('cart summary mentions a booked slot, an empty cart and other baskets', () => {
  const data = clone();
  data.cart.isSlotBooked = true;
  data.cart.items = [];
  data.preorder = [{ id: 'x' }];
  const s = summarizeCart(data)!;
  assert.match(s, /Slot: booked, 05\/11\/2026 08:00–08:30/);
  assert.match(s, /\(empty cart\)/);
  assert.match(s, /Also present \(not listed here\): preorders/);
});

test('a line without a product sheet is still listed', () => {
  const data = clone();
  data.cart.items = [{ category: 'Marketplace', products: [{ counter: 2, totalItemPrice: 9.9, product: null }] }];
  const s = summarizeCart(data)!;
  assert.match(s, /- 2 × \(unknown product, raw_response: true for details\): 9\.90 €/);
  assert.doesNotMatch(s, /empty cart/);
});

test('an unexpected shape falls back to null, and other tools have no summary', () => {
  assert.equal(summarizeCart({ foo: 1 }), null);
  assert.equal(summarizeCart('<html>'), null);
  assert.equal(summarize('get_cart', { cart: { items: 'nope' } }), null);
  assert.equal(summarize('get_orders', cartPayload), null);
});

test('render uses the summary for get_cart, and the raw payload on request', () => {
  const small = render(cartPayload, false, 'get_cart');
  assert.match(small, /^Cart drive_clcv/);
  assert.match(small, /\[summary view: \d+ of \d+ chars; call again with raw_response: true/);
  const raw = render(cartPayload, true, 'get_cart');
  assert.match(raw, /"offers"/);
  // Without a summary, the generic compact view still applies.
  assert.match(render(cartPayload, false, 'add_item_to_cart'), /compact view/);
});
