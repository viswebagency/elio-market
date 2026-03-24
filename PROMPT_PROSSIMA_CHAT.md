Continuiamo a lavorare su Elio.Market (path: ~/Desktop/Software/Elio.Market/). Leggi la memoria del progetto (project_elio_market.md, project_live_trading_priority.md, feedback_filosofia_trading.md).

Contesto: nella sessione del 20-21 marzo abbiamo completato la Fase F — Claude AI integrato, 19 strategie (9 valide), pipeline L1-L4, dashboard P&L aggregata, AI cost tracker con budget limiter, 246 test verdi, tutto deployato. 16 paper sessions attive su Polymarket.

Ora iniziamo la parte seria: trading automatico reale su crypto.

Obiettivo di questa sessione — Binance + Bybit:

1. Installare `ccxt` come libreria unificata per Binance e Bybit. Creare il Market Adapter crypto in src/core/engine/market-adapter.ts (l'interfaccia esiste gia). Deve supportare: fetch mercati spot + futures, prezzo real-time, volume 24h, order book, candele storiche.

2. Creare 5-8 strategie crypto nel DSL (src/core/strategies/crypto-strategies.ts). Mix conservative + moderate: Mean Reversion su range, Trend Following su breakout, Grid Trading, DCA su dip, RSI Oversold Bounce. Ogni strategia con SL obbligatorio e sizing max 3-5%.

3. Adattare il paper trading manager per crypto — tick piu frequenti (ogni 1-2 min vs 5 min di Polymarket), sizing in base a volatilita, gestione pair (BTC/USDT, ETH/USDT, etc.).

4. Eseguire pipeline backtest L1-L4 sulle strategie crypto con dati sintetici adattati a crypto (volatilita piu alta, pattern diversi da prediction markets).

5. Test per tutto.

Filosofia: essere speculativi minimizzando il rischio di perdite. Ogni strategia deve avere stop loss, circuit breaker, sizing conservativo. Le API key Binance e Bybit sono nel .env.local (aggiungi BYBIT_API_KEY e BYBIT_API_SECRET se mancano).

NON fare trading reale. Solo paper per ora.
