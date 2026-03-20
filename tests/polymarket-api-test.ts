/**
 * Test manuale — Polymarket API
 *
 * Esegui con: npx tsx tests/polymarket-api-test.ts
 */

async function testPolymarketAPI() {
  console.log('=== POLYMARKET API TEST ===\n');

  // 1. Test Gamma API — mercati attivi
  console.log('[1] GET /markets (top 5 per volume 24h)');
  const marketsRes = await fetch(
    'https://gamma-api.polymarket.com/markets?limit=5&active=true&closed=false&order=volume24hr&ascending=false'
  );
  console.log(`    Status: ${marketsRes.status}`);

  if (!marketsRes.ok) {
    console.error('    ERRORE:', marketsRes.statusText);
    return;
  }

  const markets = (await marketsRes.json()) as Array<Record<string, unknown>>;
  console.log(`    Mercati ricevuti: ${markets.length}\n`);

  for (const [i, m] of markets.entries()) {
    const prices = JSON.parse((m.outcomePrices as string) || '[]');
    console.log(`    [${i + 1}] ${m.question}`);
    console.log(`        ID: ${m.id}`);
    console.log(`        Prezzi: ${prices.join(', ')}`);
    console.log(`        Volume 24h: $${(m.volume24hr as number)?.toLocaleString()}`);
    console.log(`        Liquidity: $${(m.liquidityNum as number)?.toLocaleString()}`);
    console.log(`        Active: ${m.active}, Closed: ${m.closed}`);
  }

  // 2. Test CLOB API — orderbook per il primo mercato con token
  const firstWithTokens = markets.find(
    (m) => m.clobTokenIds && (m.clobTokenIds as string) !== '[]'
  );

  if (firstWithTokens) {
    const tokenIds = JSON.parse(firstWithTokens.clobTokenIds as string);
    const yesTokenId = tokenIds[0];

    console.log(`\n[2] GET /book (token YES del mercato "${firstWithTokens.question}")`);
    const bookRes = await fetch(
      `https://clob.polymarket.com/book?token_id=${yesTokenId}`
    );
    console.log(`    Status: ${bookRes.status}`);

    if (bookRes.ok) {
      const book = (await bookRes.json()) as {
        bids: Array<{ price: string; size: string }>;
        asks: Array<{ price: string; size: string }>;
      };
      console.log(`    Bids: ${book.bids?.length ?? 0} livelli`);
      console.log(`    Asks: ${book.asks?.length ?? 0} livelli`);
      if (book.bids?.length) {
        const bestBid = book.bids[book.bids.length - 1];
        console.log(`    Best bid: ${bestBid.price} (size: ${bestBid.size})`);
      }
      if (book.asks?.length) {
        const bestAsk = book.asks[0];
        console.log(`    Best ask: ${bestAsk.price} (size: ${bestAsk.size})`);
      }
    }

    console.log(`\n[3] GET /midpoint`);
    const midRes = await fetch(
      `https://clob.polymarket.com/midpoint?token_id=${yesTokenId}`
    );
    console.log(`    Status: ${midRes.status}`);
    if (midRes.ok) {
      const mid = await midRes.json();
      console.log(`    Midpoint: ${(mid as { mid: string }).mid}`);
    }
  }

  console.log('\n=== TEST COMPLETATO ===');
}

testPolymarketAPI().catch(console.error);
