/**
 * Purpose-built views for payloads that stay too large after compact().
 *
 * `GET /api/cart` is the main offender: every line carries the full product
 * sheet (offers, promotions, nutrition, sellers), so a seven-line cart is
 * ~100k chars raw and still ~70k compacted, enough to be cut off before the
 * last lines. An assistant only needs the totals, the slot and, per line, what
 * it takes to change it. A summarizer returns null when the payload does not
 * have the expected shape, and the caller falls back to the generic compact view.
 */

type Json = Record<string, any>;
type Summarizer = (data: unknown) => string | null;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function money(value: unknown, currency = '€'): string {
  return typeof value === 'number' ? `${value.toFixed(2)} ${currency}` : '?';
}

const PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

function parisTime(iso: unknown): string | null {
  if (typeof iso !== 'string') return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : PARIS.format(date);
}

function describeSlot(cart: Json): string {
  const slot = cart.slot;
  if (!isObject(slot) || !isObject(slot.date)) return cart.isSlotBooked ? 'booked' : 'not booked';
  const begin = parisTime(slot.date.begin);
  const end = parisTime(slot.date.end)?.split(' ').pop();
  const when = begin ? `${begin}–${end ?? '?'} (Europe/Paris)` : '?';
  if (cart.isSlotBooked || slot.isBooked) return `booked, ${when}`;
  return `not booked (default proposal ${when})`;
}

function offerOf(attributes: Json): Json | null {
  const offer = attributes.offers?.[attributes.ean]?.[attributes.offerServiceId]?.attributes;
  return isObject(offer) ? offer : null;
}

function describeLine(line: Json, cart: Json): string {
  const currency = cart.currency ?? '€';
  const attributes = line.product?.attributes;
  if (!isObject(attributes)) {
    // Delisted or marketplace line without a product sheet: still a line in the cart.
    return `- ${line.counter ?? '?'} × (unknown product, raw_response: true for details): ${money(line.totalItemPrice, currency)}`;
  }

  const title = [attributes.title ?? '(untitled)', attributes.packaging].filter(Boolean).join(', ');
  let out = `- ${line.counter ?? '?'} × ${title} (EAN ${attributes.ean ?? '?'}): ${money(line.totalItemPrice, currency)}`;

  if (typeof line.totalItemDiscount === 'number' && line.totalItemDiscount > 0) {
    out += ` (was ${money(line.totalItemPriceWithoutPromo, currency)}, −${money(line.totalItemDiscount, currency)})`;
  }
  if (typeof line.totalItemCardSaving === 'number' && line.totalItemCardSaving > 0) {
    out += ` (+${money(line.totalItemCardSaving, currency)} on loyalty card)`;
  }

  // Carrefour lists the product's promotion even when this quantity does not trigger it.
  const promotion = offerOf(attributes)?.promotion;
  if (isObject(promotion) && promotion.label) {
    const applied = typeof line.totalItemDiscount === 'number' && line.totalItemDiscount > 0;
    out += applied ? ` — promo "${promotion.label}"` : ` — promo available, not applied: "${promotion.label}"`;
  }
  if (line.isFree) out += ' — FREE';
  if (line.available === false) out += ' — UNAVAILABLE';
  if (line.isStockOff) out += ' — OUT OF STOCK';
  if (attributes.offerServiceId && attributes.offerServiceId !== cart.facilityServiceId) {
    out += ` — basketServiceId ${attributes.offerServiceId}`;
  }
  return out;
}

function nonEmpty(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : isObject(value) && Object.keys(value).length > 0;
}

export function summarizeCart(data: unknown): string | null {
  if (!isObject(data) || !isObject(data.cart) || !Array.isArray(data.cart.items)) return null;
  const cart = data.cart;
  const currency = cart.currency ?? '€';

  const lines: string[] = [];
  let units = 0;
  for (const group of cart.items) {
    if (!isObject(group) || !Array.isArray(group.products)) continue;
    const described = group.products.filter(isObject).map((line: Json) => {
      if (typeof line.counter === 'number') units += line.counter;
      return describeLine(line, cart);
    });
    if (described.length > 0) lines.push(`[${group.category ?? 'Other'}]`, ...described);
  }

  const out: string[] = [];
  out.push(
    `Cart ${cart.type ?? '?'}, store ${cart.storeRef ?? '?'}, basketServiceId ${cart.facilityServiceId ?? '?'}: ` +
      `${cart.nbProducts ?? '?'} products (${units} units), ${cart.nbUnavailable ?? 0} unavailable`
  );
  out.push(
    `Total to pay: ${money(cart.totalAmount, currency)} (products ${money(cart.totalProductsPrice, currency)}` +
      ` − discounts ${money(cart.totalDiscount, currency)} + fees ${money(cart.totalFees, currency)})`
  );
  if (isObject(cart.returnableBags) && cart.returnableBags.quantity) {
    out.push(
      `Fees detail: ${cart.returnableBags.quantity} bags × ${money(cart.returnableBags.unitPrice, currency)}` +
        (cart.deliveryFees ? `, delivery ${money(cart.deliveryFees, currency)}` : '')
    );
  }
  out.push(
    `Savings: ${money(cart.totalSavings, currency)} immediate, ${money(cart.totalCardSaving, currency)} credited to the loyalty card`
  );
  if (typeof cart.remainedAmount === 'number' && cart.remainedAmount > 0) {
    out.push(`Minimum order not reached: ${money(cart.remainedAmount, currency)} missing`);
  }
  out.push(`Slot: ${describeSlot(cart)}`);
  if (nonEmpty(cart.promoCodes)) out.push(`Promo codes: ${JSON.stringify(cart.promoCodes)}`);
  if (nonEmpty(cart.slotFailures)) out.push(`Slot failures: ${JSON.stringify(cart.slotFailures)}`);
  if (isObject(data.meta) && nonEmpty(data.meta.errors)) out.push(`Errors: ${JSON.stringify(data.meta.errors)}`);

  const others = [
    nonEmpty(data.marketplace?.subBaskets) && 'marketplace sub-baskets',
    nonEmpty(data.additionalOrders) && 'additional orders',
    nonEmpty(data.nonFoodDeliveryCart) && 'non-food delivery cart',
    nonEmpty(data.preorder) && 'preorders',
  ].filter(Boolean);
  if (others.length > 0) out.push(`Also present (not listed here): ${others.join(', ')}`);

  out.push('', 'Lines: quantity × title (EAN): price paid', ...(lines.length > 0 ? lines : ['(empty cart)']));
  return out.join('\n');
}

const SUMMARIES: Record<string, Summarizer> = {
  get_cart: summarizeCart,
};

/** Summary for `tool`'s payload, or null when there is none or the shape is unexpected. */
export function summarize(tool: string, data: unknown): string | null {
  const summarizer = SUMMARIES[tool];
  if (!summarizer) return null;
  try {
    return summarizer(data);
  } catch {
    return null;
  }
}
