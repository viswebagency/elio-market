# Prompt per le prossime sessioni — Elio.Market

Copia e incolla uno di questi all'inizio di una nuova chat.

---

## Sessione 1 — Binance + Bybit: Market Adapter e Paper Trading Crypto

Continuiamo a lavorare su Elio.Market (path: ~/Desktop/Software/Elio.Market/). Leggi la memoria del progetto (project_elio_market.md e project_live_trading_priority.md).

Contesto: abbiamo un motore di strategie DSL funzionante con 19 strategie Polymarket, pipeline backtest L1-L4, paper trading automatico, Knowledge Base AI con Claude. 246 test verdi. Ora dobbiamo espandere a crypto.

Obiettivo di questa sessione:

1. Creare il Market Adapter per Binance (src/core/engine/market-adapter.ts ha gia l'interfaccia). Deve supportare: fetch mercati spot + futures, prezzo real-time, volume 24h, order book. Usare il pacchetto `ccxt` per supportare sia Binance che Bybit con la stessa interfaccia.

2. Creare 5-8 strategie crypto iniziali nel DSL (conservative + moderate): Mean Reversion, Trend Following, Breakout, Grid Trading, DCA su dip. Definirle in src/core/strategies/crypto-strategies.ts.

3. Avviare paper trading crypto — adattare il paper trading manager per gestire mercati crypto (tick piu frequenti, sizing in base a volatilita).

4. Test per tutto.

Le API key Binance e Bybit sono nel .env.local. Non fare trading reale, solo paper.

---

## Sessione 2 — MetaTrader 5: Forex e Azioni via MetaAPI

Continuiamo a lavorare su Elio.Market (path: ~/Desktop/Software/Elio.Market/). Leggi la memoria del progetto.

Contesto: abbiamo Polymarket + crypto (Binance/Bybit) funzionanti con paper trading. Ora aggiungiamo forex e azioni via MetaTrader 5.

Obiettivo di questa sessione:

1. Integrare MetaAPI (https://metaapi.cloud) come provider per MT5. Creare il Market Adapter MT5 che supporta: fetch simboli forex (EUR/USD, GBP/USD, etc.) e azioni (indici, singoli titoli), prezzo real-time, spread, volumi.

2. Creare 5-8 strategie forex nel DSL: Scalping su spread basso, Trend Following su H1/H4, Mean Reversion su range, Carry Trade, News Trading (con catalyst detection AI).

3. Creare 3-5 strategie azioni: Momentum su indici, Value su singoli titoli, Sector Rotation.

4. Paper trading forex/azioni con tick adeguati ai timeframe (non ogni 5 min come Polymarket).

5. Test per tutto.

METAAPI_TOKEN e' nel .env.local.

---

## Sessione 3 — Motore di Esecuzione Live (il passo finale)

Continuiamo a lavorare su Elio.Market (path: ~/Desktop/Software/Elio.Market/). Leggi la memoria del progetto.

Contesto: abbiamo paper trading funzionante su Polymarket, crypto (Binance/Bybit), forex e azioni (MT5). Le strategie sono validate con backtest L1-L4. Ora costruiamo il motore per il trading REALE.

Obiettivo di questa sessione:

1. Order Execution Engine — modulo che piazza ordini reali su Binance/Bybit (via ccxt) e MT5 (via MetaAPI). Supporto per: market order, limit order, stop loss, take profit. Gestione errori e retry.

2. Risk Management Live — kill switch globale (ferma tutto con un comando Telegram), circuit breaker per strategia, limiti di esposizione massima per exchange, daily loss limit. Tutto configurabile.

3. Sicurezza — chiavi API criptate, permessi API solo trading (no withdraw), IP whitelist se supportato.

4. Monitoring — ogni trade reale notificato via Telegram istantaneamente. Dashboard real-time aggiornata.

5. Promozione graduale: prima una sola strategia con $50, poi scala se profittevole dopo 7 giorni.

6. Test con mock degli exchange (non fare trading reale durante i test).

IMPORTANTE: partire con sizing minimo. La prima strategia live deve rischiare massimo $50.

---

## Sessione 4 — Dashboard Avanzata e Multi-Exchange

Continuiamo a lavorare su Elio.Market (path: ~/Desktop/Software/Elio.Market/). Leggi la memoria del progetto.

Obiettivo:

1. Dashboard unificata multi-exchange — vista unica su tutte le posizioni aperte (Polymarket, Binance, Bybit, MT5), P&L aggregato per exchange e per strategia.

2. Pagina dettaglio strategia — storico trade, equity curve individuale, log decisioni AI, parametri, livello backtest.

3. Pagina dettaglio trade — entry/exit, motivo, prezzo, slippage effettivo vs stimato, P&L netto.

4. Report settimanale automatico via Telegram (oltre al daily).

5. Alert configurabili — drawdown > X%, nuova opportunita score > 80, circuit breaker attivato.

---

## Sessione 5 — Backtest su Dati Storici Reali

Continuiamo a lavorare su Elio.Market (path: ~/Desktop/Software/Elio.Market/). Leggi la memoria del progetto.

Obiettivo:

1. Data loader per dati storici reali — Binance klines API (candele 1m/5m/1h/1d), MT5 historical data via MetaAPI.

2. Sostituire il generatore sintetico Monte Carlo con dati reali per le strategie crypto e forex.

3. Rieseguire pipeline L1-L4 su tutte le strategie crypto/forex con dati storici reali (minimo 1 anno).

4. Confronto: backtest sintetico vs backtest su dati reali — calibrare il generatore sintetico se divergono.

5. Walk-forward test: train su 80% dei dati, test su 20% piu recente.
