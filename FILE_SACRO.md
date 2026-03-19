# FILE SACRO — Elio.Market

> Questo documento e la bibbia operativa del progetto Elio.Market.
> Ogni decisione di sviluppo, architettura e business DEVE essere coerente con quanto scritto qui.
> Nessuna modifica a questo file senza approvazione esplicita del fondatore.
> Ultima revisione: 19 marzo 2026

---

## 1. IDENTITA

- **Nome**: Elio.Market
- **Significato**: Elio da Helios (sole) — al centro di tutti i mercati
- **Dominio**: elio.market
- **Lingua interfaccia**: Italiano (predisposta per i18n futuro)
- **Lingua codice**: Inglese (variabili, commenti, API, schema DB, commit messages)
- **Tipo**: Piattaforma di analisi quantitativa multi-mercato con AI
- **NON e**: un bookmaker, un broker, un consulente finanziario
- **E**: un tool di analisi statistica e algoritmica per uso personale e, in futuro, multi-utente

---

## 2. LE 5 MACRO AREE

```
ELIO.MARKET
|
|-- POLYMARKET (prediction markets)
|   |-- Politica, Crypto, Sport, Entertainment, Economia, Scienza
|   |-- API: Polymarket API (gratuita, completa, WebSocket real-time)
|   |-- N strategie indipendenti
|   |-- Dashboard confronto INTERNA
|
|-- BETFAIR EXCHANGE (trading sportivo)
|   |-- Calcio (Serie A, B, Champions, Europa League, Mondiali, Europei, nazionali principali)
|   |-- Tennis, Basket, altri sport
|   |-- Politica, Entertainment, Specials (mercati non sportivi Betfair)
|   |-- Tipologie: Back, Lay, Trading In-Play, Cash Out
|   |-- Match Odds, Over/Under, BTTS, Correct Score, HT/FT, Asian Handicap, DNB
|   |-- API: Betfair Exchange API (autenticazione SSL)
|   |-- N strategie indipendenti
|   |-- Dashboard confronto INTERNA
|
|-- AZIONARIO & DERIVATI
|   |-- Azioni (DeGiro per lungo periodo, Interactive Brokers per trading attivo)
|   |-- ETF / ETC / Commodities (oro, petrolio, gas, grano)
|   |-- Opzioni (covered call, iron condor, straddle, ecc.)
|   |-- Orizzonti: scalping (ore), swing (giorni/settimane), position (mesi), investimento (anni/vita)
|   |-- API: Yahoo Finance / Alpha Vantage (gratis), Twelve Data (premium se necessario)
|   |-- N strategie indipendenti
|   |-- Dashboard confronto INTERNA
|
|-- FOREX (MetaTrader 5)
|   |-- Major pairs (EUR/USD, GBP/USD, USD/JPY, ecc.)
|   |-- Minor & Exotic
|   |-- Broker consigliato: IC Markets o Pepperstone (spread raw 0.0 pip)
|   |-- API: MQL5 / MT5 API
|   |-- N strategie indipendenti
|   |-- Dashboard confronto INTERNA
|
|-- CRYPTO
|   |-- Spot trading
|   |-- Futures / Perpetual
|   |-- Arbitraggio con Polymarket (Polymarket gira su USDC)
|   |-- Broker: Binance (spot 0.1%) o Bybit (futures 0.01%/0.06%)
|   |-- API: Binance/Bybit API
|   |-- N strategie indipendenti
|   |-- Dashboard confronto INTERNA
|
|-- META-DASHBOARD (livello superiore)
    |-- Confronto performance aggregate tra le 5 aree
    |-- Dove rende di piu il capitale?
    |-- Correlazioni cross-area
```

### Regola: ogni macro area e un "plugin"
- Architettura modulare: ogni area ha il suo adapter per le API
- Aggiungere o rimuovere un'area non tocca le altre
- Ogni area ha le sue strategie, il suo bankroll, la sua dashboard
- Le strategie si confrontano SOLO tra loro dentro la stessa area
- Il meta-dashboard confronta le aree tra loro a livello aggregato

---

## 3. MOTORE STRATEGIE

### 3.1 Tre modalita di creazione

| Modalita | Descrizione | Per chi |
|---|---|---|
| **Autopilot AI** | L'AI analizza mercati, genera strategie, backtesta, promuove quelle profittevoli. L'utente osserva | Chi non vuole pensare |
| **Copilot AI** (DEFAULT) | L'utente ha un'idea, l'AI la verifica con dati, la struttura, la backtesta, spiega pro/contro | La maggior parte degli utenti |
| **Manual + AI Advisor** | L'utente crea la strategia, l'AI interviene solo come rete di sicurezza | Utenti esperti |

**L'AI puo anche proporre strategie non richieste** quando trova pattern interessanti nei dati.
L'AI fa da challenger: "hai detto X, ma i dati dicono Y, sei sicuro?"

### 3.2 Mini-linguaggio di regole

Le strategie vengono definite come regole strutturate:

```
QUANDO: [condizione di ingresso]
E: [condizione aggiuntiva]
E: [condizione aggiuntiva]
ALLORA: [azione] (ENTRA long / ENTRA short)
STAKE: [metodo di sizing]
ESCI_SE: [condizione di uscita] OPPURE [condizione di uscita]
```

Questo permette:
- Creazione rapida di nuove strategie (minuti, non giorni)
- Generazione automatica da parte dell'AI
- Visual builder futuro sopra lo stesso motore (Fase 2, per multi-utente)

### 3.3 Versionamento strategie

- Ogni modifica a una strategia crea una NUOVA VERSIONE (es. PM-003 v1 → PM-003 v2)
- Il track record della versione precedente resta congelato e consultabile
- La nuova versione riparte dal ciclo completo: backtest → paper → live
- Dashboard mostra storico per versione con confronto side by side

### 3.4 Strategie iniziali

- 10-15 strategie per area in fase iniziale
  - 5 conservative (basso rischio, alta probabilita)
  - 5 moderate
  - 3-5 aggressive
- Scalabili a 50, 100+ quando il sistema e rodato

---

## 4. SISTEMA DI BACKTEST — 4 LIVELLI

```
100 strategie
    | Livello 1: Quick Scan (ultimi 3 mesi, secondi)
40 sopravvivono (scartate quelle con ROI negativo)
    | Livello 2: Robustezza (1-2 anni, walk-forward test)
20 sopravvivono (scartate quelle che non battono il benchmark)
    | Livello 3: Stress Test (5+ anni, Monte Carlo simulation)
12 sopravvivono (scartate quelle con drawdown insostenibile)
    | Livello 4: Overfitting Check (variazione parametri +/- 10%)
8 sopravvivono (scartate quelle fragili)
    | Paper Trading 30 giorni minimo
3-5 strategie LIVE con stake minimo
```

### Regole sacre del backtest

- **OGNI backtest DEVE includere le commissioni reali** della piattaforma
- **OGNI backtest DEVE includere slippage simulato** (1-2% sul prezzo)
- Una strategia profittevole al lordo ma negativa al netto e una strategia PERDENTE
- Il sistema calcola e mostra SEMPRE il profitto netto dopo commissioni
- Lo slippage reale viene tracciato nel live e confrontato con quello simulato

---

## 5. MODALITA DI ESECUZIONE

### 5.1 Tre modalita per strategia

| Modalita | Comportamento |
|---|---|
| **Osservazione** | La strategia gira, logga, non esegue nulla |
| **Paper Trading** | Esegue con capitale virtuale, tracking completo |
| **Live** | Esegue con capitale reale |

### 5.2 Promozione graduale obbligatoria

Osservazione → Paper Trading (min 30 giorni positivi) → Live (stake minimo)

NESSUNA strategia va live senza aver superato backtest + paper trading.

### 5.3 Gradi di automazione

| Livello | Comportamento |
|---|---|
| **Pilota** | Tutto manuale, la piattaforma mostra dati e analisi |
| **Copilota** | La piattaforma propone, l'utente approva via Telegram |
| **Autopilota** | La piattaforma esegue autonomamente entro i limiti |

Default: Copilota. Autopilota solo su strategie con profittabilita dimostrata in paper trading.

### 5.4 Esecuzione live — sicurezza

- Paper e osservazione: sempre automatiche
- Live: semi-automatica all'inizio (notifica Telegram + tap per confermare)
- Full auto: attivabile per singola strategia, con limiti di perdita giornaliera hard-coded
- Passaggio a full auto graduale e per strategia

---

## 6. MONEY MANAGEMENT

### 6.1 Regole sacre sul capitale

1. **Max drawdown per strategia**: -20%. Superato → pausa automatica. L'AI analizza prima di riattivare
2. **Max drawdown per area**: -25% del bankroll allocato a quell'area
3. **Max drawdown globale**: -30% del capitale totale. Superato → TUTTO in pausa. Full stop
4. **Nessuna strategia riceve piu del 10% del bankroll** della sua area all'inizio. Sale solo se performa
5. **Risk-adjusted return** come metrica primaria (non il rendimento lordo)
6. **Ruin risk = 0**: nessuna combinazione di strategie puo portare a perdere tutto

### 6.2 Sizing configurabile per strategia

- Kelly Criterion
- Fixed percentage
- Fixed amount
- Configurabile per ogni singola strategia

### 6.3 Circuit breaker

Se una strategia perde X% in N giorni → si ferma automaticamente.
Non e possibile monitorare 300 strategie a mano.

### 6.4 Allocazione dinamica

Piu capitale alle strategie che performano, meno a quelle in drawdown.

### 6.5 Obiettivo di rendimento

NON fissiamo target di rendimento. Motivo:
- Un target alto porta a rischi eccessivi
- Un target basso frena le opportunita

Fissiamo invece:
- Vincoli di rischio (drawdown max sopra)
- Ogni strategia live DEVE avere EV positivo dimostrato
- Benchmark di riferimento (non target):

| Area | Benchmark |
|---|---|
| Polymarket | Comprare random al 50% |
| Betfair | Seguire sempre il favorito |
| Azioni | S&P 500 buy & hold (~10% annuo) |
| Forex | Buy & hold EUR/USD (~0%) |
| Crypto | Bitcoin buy & hold |

Se battiamo i benchmark in modo consistente, il sistema funziona.

### 6.6 Metodo di calcolo probabilita — Approccio ibrido

```
FONTE 1: Quote implicite dal mercato (Betfair/Polymarket)
         = Il "consensus" di migliaia di trader
         = Baseline

FONTE 2: Modello statistico nostro
         = Dati storici, forma, head-to-head, casa/trasferta,
           infortuni, meteo, trend, volume, momentum
         = La nostra stima indipendente

FONTE 3: Delta (Edge)
         = Fonte 2 - Fonte 1
         = Se il nostro modello dice 65% e il mercato prezza 55%
           → Edge = +10% → c'e valore
         = Se il delta e negativo o trascurabile → no trade
```

L'edge e il cuore di tutto. Senza edge positivo, nessuna strategia va live.

### 6.7 Livelli di rischio basati su Expected Value (EV)

| Livello | EV minimo | Probabilita minima | Per chi |
|---|---|---|---|
| **Conservativo** | > 5% | > 60% | Protezione capitale, rendimento stabile |
| **Moderato** | > 3% | > 45% | Equilibrio rischio/rendimento |
| **Aggressivo** | > 1% | Qualsiasi | Alto rendimento, alta volatilita |

Ogni strategia ha un livello di rischio assegnato che determina i filtri di ingresso.

### 6.8 Budget iniziale

- **Capitale reale iniziale**: 500 EUR (solo Polymarket in M1)
- **Budget aggiuntivo**: 200-500 EUR per ogni nuova area quando viene attivata
- **Capitale simulato per paper trading**: configurabile (default 1.000 EUR per area)
- **Regola sacra**: il capitale reale entra SOLO dopo che il paper trading ha dimostrato profittabilita per almeno 30 giorni. Se il paper e in perdita, non si mette un centesimo
- MAI aggiungere capitale per "recuperare" perdite

---

## 7. CONFLICT RESOLUTION ENGINE

Obbligatorio prima di qualsiasi esecuzione.

**Problema**: con 100 strategie per area, due strategie possono dare segnali opposti sullo stesso asset.

**Regole**:
- Il sistema rileva conflitti PRIMA di eseguire
- Opzioni configurabili dall'utente:
  - Priorita per performance (esegue solo la strategia con track record migliore)
  - Neutralizzazione (non esegue nessuna, notifica)
  - Netting (esegue solo il delta netto)
- Ogni conflitto viene loggato

---

## 8. AI LAYER

### 8.1 Ruoli distinti

- **AI Analista**: analizza dati, spiega performance, genera journal post-operazione. Sempre attivo
- **AI Creatore**: propone nuove strategie basate su pattern. Ogni proposta passa dal ciclo backtest completo. Attivabile su richiesta

### 8.2 Modelli per task

| Task | Modello |
|---|---|
| Analisi complessa, creazione strategia | Claude Opus |
| Analisi standard, spiegazioni | Claude Sonnet |
| Classificazione, tag, summary | Claude Haiku |
| Embeddings, ricerca semantica | OpenAI text-embedding-3-small |

### 8.3 Knowledge Base condivisa

Architettura a 3 livelli per ottimizzare costi:

**Livello 1 — Profili statici** (aggiornamento 1x/giorno)
- Profilo squadra/giocatore, asset/azione, mercato Polymarket
- Generati in batch notturno

**Livello 2 — Analisi evento** (on-demand, cache)
- Pre-match, pre-mercato, analisi Polymarket
- Generati al primo utente che li chiede, poi serviti dalla cache

**Livello 3 — Analisi personalizzata** (unica per utente, NON condivisa)
- Calibrata sulla strategia e bankroll dell'utente
- Usa Livelli 1 e 2 come input, genera solo il delta personale

**Regole di invalidazione cache:**

| Tipo di dato | Invalidazione |
|---|---|
| Profilo squadra | Ogni 24h o dopo ogni partita |
| Analisi pre-match | Ogni 6h, poi ogni 30min nelle ultime 2h |
| Quote/prezzi | Real-time (no AI, solo dati) |
| Analisi Polymarket | Quando prezzo si muove > 5% |
| Profilo azione | Ogni 24h o su evento significativo |
| Analisi azione | Quando prezzo si muove > 3% o news rilevante |

**Risparmio stimato: 95-99%** sulle analisi di mercato grazie alla KB condivisa.

**Network effect**: piu utenti usano la piattaforma → piu dati alimentano la KB → analisi migliori per tutti → piu utenti attratti. Questo e il vantaggio competitivo principale: la KB cresce esponenzialmente con la base utenti e diventa impossibile da replicare per un competitor che parte da zero.

### 8.4 Ottimizzazione costi AI

1. **Cache multi-livello**: identica → cache L1 (0 costo), simile → aggiorna delta (−70%), stesso tipo → template (−40%)
2. **Alert e trigger NON passano dall'AI**: sono regole if/then codificate
3. **Pre-calcolo notturno**: profili aggiornati in batch, strategie leggono da DB
4. **Prompt caching**: prompt di sistema riutilizzabili (sconto 90% su Claude)
5. **Risposte strutturate** (JSON) dove possibile — meno token
6. **Budget giornaliero AI**: limite hard. Analisi non critiche aspettano se superato
7. **Batch processing**: analisi non urgenti accumulate e processate insieme

**Costi stimati ottimizzati:**

| Scenario | Costo/mese |
|---|---|
| Solo fondatore | 20-30 EUR |
| 100 utenti | 200-300 EUR |
| 1.000 utenti | 1.500-2.000 EUR |

---

## 9. SISTEMA DI ALERT E TRIGGER

Condizioni programmabili, NON basate su AI (regole codificate, costo zero):

- Movimenti di prezzo significativi su qualsiasi mercato
- Soglie raggiunte su indicatori tecnici
- Strategie che raggiungono N operazioni consecutive in perdita
- Circuit breaker attivati
- Anomalie di mercato

Canali: Telegram Bot (primario), notifiche push PWA, email (secondario).

### 9.2 Telegram Bot — funzionalita

| Funzione | Tier |
|---|---|
| Alert segnali di ingresso/uscita | Tutti |
| Riepilogo giornaliero performance | Tutti |
| Conferma/rifiuto esecuzione ordine (tap) | Pro + Elite |
| Kill switch di emergenza | Pro + Elite |
| Comandi: /status /performance /stop /start | Pro + Elite |
| Alert prioritari (senza DND) | Elite |

### 9.3 Community

- Canale Telegram pubblico: analisi giornaliere, segnali selezionati, discussione
- In futuro: sezione community in-app con classifiche trader, commenti su strategie, voti
- La community alimenta il network effect e la retention degli utenti

---

## 10. CORRELAZIONE CROSS-AREA

Non solo confronto performance, ma correlazione tra eventi:

- Elezioni su Polymarket → impatto su azioni difesa/energia/forex
- Risultati Champions → movimento quote Betfair + azioni club quotati
- Decisioni banche centrali → impatto su azioni + Polymarket economia + forex

Obiettivo: trovare arbitraggi cross-area che nessuno cerca.

---

## 11. METRICHE E TRACKING

### 11.1 Per ogni strategia

| Metrica | Cosa misura |
|---|---|
| Win Rate | % operazioni in profitto |
| ROI | Ritorno sul capitale investito |
| Profit Factor | Guadagni totali / perdite totali (>1 = profittevole) |
| Max Drawdown | Peggior perdita consecutiva dal picco |
| Sharpe Ratio | Rendimento aggiustato per il rischio |
| Edge medio | Differenza media tra probabilita stimata e prezzo di mercato |
| Tempo medio in posizione | Quanto resta aperta un'operazione |
| Slippage reale vs simulato | Delta tra backtest e live |

### 11.2 Benchmark

Ogni strategia viene confrontata con:
- Le altre strategie della stessa area
- Il benchmark dell'area
- Se non batte il benchmark, non serve — anche se e in positivo

### 11.3 Journal / Diario operativo

Per ogni operazione, log automatico:
- Snapshot dello stato al momento dell'ingresso
- Motivo (quale regola ha triggerato)
- Stato del mercato (volatilita, volume, trend)
- Esito finale
- Analisi AI post-operazione (cosa e andato bene/male)

### 11.4 Sistema di tag

Ogni operazione taggata per:
- Tipo di mercato (politica, sport, crypto, tech stock...)
- Condizione di mercato (trending, ranging, volatile, calmo)
- Timeframe (scalping, intraday, swing, position, long term)
- Confidence level del segnale

### 11.5 Trasparenza totale

Il tracking delle performance e completamente trasparente. Nessun dato nascosto.

---

## 12. INFRASTRUTTURA TECNICA

### 12.1 Stack

| Componente | Tecnologia |
|---|---|
| Framework | Next.js 14 + TypeScript + Tailwind CSS |
| Frontend | PWA (installabile, notifiche push, offline access) |
| Auth + dati relazionali | Supabase (PostgreSQL) |
| Serie temporali | TimescaleDB Cloud |
| AI | Claude API (Opus/Sonnet/Haiku) + OpenAI (embeddings) |
| Cron/Jobs | Vercel Cron o Upstash QStash |
| Notifiche | Telegram Bot API + Push notifications PWA |
| Hosting | Vercel |
| PDF/Image export | @react-pdf/renderer + html-to-image |
| Dati sport | API-Football + Betfair API |
| Dati Polymarket | Polymarket API diretta |
| Dati azioni | Yahoo Finance / Alpha Vantage |
| Dati forex | MT5 API |
| Dati crypto | Binance / Bybit API |

### 12.2 Database — architettura a 2 DB

| Tipo di dato | Database |
|---|---|
| Utenti, auth, strategie, config, journal, tag | Supabase (PostgreSQL) con RLS |
| Prezzi, quote, candele, storico operazioni | TimescaleDB Cloud |

### 12.3 Data Pipeline

- **Normalizzazione**: formato unico indipendente dalla fonte
- **Storicizzazione**: ogni dato salvato permanentemente. Le API cambiano, i dati spariscono
- **Versionamento**: se cambia un calcolo, sappiamo quale versione ha prodotto quale risultato

### 12.4 API propria

La piattaforma espone le sue API:
- Collegamento bot esterni
- Dashboard custom
- Base per multi-utente
- Il Telegram bot la consuma come qualsiasi altro client

### 12.5 Scheduling 24/7

```
00:00-06:00  Crypto, Forex (sessione asiatica)
07:00-09:00  Forex (apertura Londra), Pre-market azioni EU
09:00-15:30  Azioni EU, Forex pieno regime
15:30-22:00  Azioni US, Forex (sessione US)
20:00-22:00  Sport europei (partite serali)
22:00-00:00  Crypto, Polymarket, sport americani
Sabato-Domenica: Sport, Crypto, Polymarket
Polymarket e Crypto: 24/7/365
```

- Le strategie si attivano/disattivano in base agli orari del loro mercato
- Do Not Disturb configurabile per utente
- Time zone configurabile

---

## 13. SICUREZZA — 5 LIVELLI

### Livello 1 — Infrastruttura

- HTTPS ovunque (certificati Vercel)
- Variabili d'ambiente per tutti i segreti, MAI nel codice
- Rate limiting su tutte le API
- WAF via Vercel/Cloudflare
- Headers di sicurezza: CSP, HSTS, X-Frame-Options, X-Content-Type-Options

### Livello 2 — Autenticazione e autorizzazione

- Supabase Auth con 2FA obbligatorio per operazioni live
- Row Level Security su PostgreSQL: un utente NON PUO MAI accedere ai dati di un altro
- JWT con scadenza breve (15 min) + refresh token
- Max 3 sessioni attive, logout remoto
- API key dei broker criptate con AES-256 at rest

### Livello 3 — Protezione del capitale

- Limiti di esecuzione hard-coded: max ordine singolo = X% del bankroll
- Kill switch: endpoint che congela tutto, raggiungibile da Telegram
- IP whitelisting per API broker: solo i nostri server eseguono ordini
- Doppia conferma per operazioni sopra soglia
- Audit log immutabile: ogni operazione registrata, non cancellabile

### Livello 4 — Codice e CI/CD

- Dependency scanning automatico (Dependabot/Snyk)
- SAST (Static Analysis) ad ogni commit
- Nessun segreto nel repo, neanche nei commit passati
- Ambienti separati: dev / staging / production
- Principio del minimo privilegio per ogni servizio

### Livello 5 — Monitoraggio continuo

- Health check ogni minuto
- Alert Telegram per anomalie: login IP sconosciuto, spike richieste, errori auth ripetuti
- Penetration test automatici settimanali (OWASP ZAP)
- Log centralizzati con retention 90 giorni

### Test di sicurezza automatici

| Frequenza | Test |
|---|---|
| Ogni deploy | SAST + dependency check (bloccante) |
| Ogni ora | Health check + anomaly detection |
| Ogni giorno | Scansione vulnerabilita esterne |
| Ogni settimana | Penetration test automatico |
| Ogni mese | Review manuale log + aggiornamento dipendenze |

---

## 14. MODELLO DI BUSINESS

### 14.1 Tier

| | Free | Pro (29 EUR/mese) | Elite (79 EUR/mese) |
|---|---|---|---|
| Aree | 1 a scelta | Tutte e 5 | Tutte e 5 |
| Strategie attive | 3 | 30 | Illimitate |
| Backtest | Solo Livello 1 | Tutti e 4 | Tutti + priorita |
| Modalita | Solo Pilota | Pilota + Copilota | Tutte + Autopilota |
| Paper trading | Si | Si | Si |
| Live trading | No | Si | Si |
| Copy trading | Copia solo | Copia + pubblica | Copia + pubblica + marketplace |
| AI Advisor | Base | Completo | Completo + AI Creator |
| Storico | 3 mesi | 1 anno | Illimitato |
| Telegram bot | Alert base | Alert + esecuzione | Tutto + priorita |

### 14.2 Revenue aggiuntive

| Fonte | Fase |
|---|---|
| Affiliate broker FINANZIARI (IB, Binance — NO Betfair per Decreto Dignita) | Fase 1 |
| Abbonamenti Pro/Elite | Fase 2 |
| Marketplace strategie (commissione 20-30%) | Fase 2 |
| Copy trading premium | Fase 2 |
| Dati aggregati anonimi | Fase 3 |
| White label | Fase 3 |
| Feed analisi via API a terzi | Fase 3 |

### 14.3 Costi stimati

| Scenario | Costo/mese |
|---|---|
| Solo fondatore | 70-90 EUR |
| 100 utenti | 450-550 EUR |
| 1.000 utenti | ~3.000 EUR |

### 14.4 Break-even

- Con solo Pro: 18 utenti paganti
- Con solo Elite: 7 utenti paganti
- Misto (70% Pro, 30% Elite): ~13 utenti paganti
- Con rapporto freemium 40% paganti: ~33 utenti totali

### 14.5 Multi-utente — modello copy trading

- Strategie private per default, condivisibili per scelta
- Un utente puo pubblicare una strategia come "pubblica"
- Altri la vedono, possono copiarla (modello eToro)
- Apre la porta a: strategie premium a pagamento, marketplace, classifiche trader

---

## 15. NORMATIVA E COMPLIANCE

### 15.1 Posizionamento legale

Elio.Market e un **tool di analisi statistica e algoritmica**.
- NON e un bookmaker
- NON e un broker
- NON e un consulente finanziario
- NON fornisce consulenza finanziaria personalizzata

### 15.2 Obblighi Italia

**Scommesse (Decreto Dignita — L. 96/2018):**
- Vietata qualsiasi pubblicita, anche indiretta, di giochi e scommesse
- Sanzioni: 50.000 — 500.000 EUR
- NESSUN link affiliato a bookmaker
- NESSUNA quota di bookmaker nominata (mostriamo probabilita nostre)
- MAI le parole "scommetti", "gioca", "punta"
- SEMPRE: "analisi", "probabilita", "modello statistico"
- Avviso obbligatorio gioco responsabile + numero verde 800-558822
- Verifica eta 18+ obbligatoria

**Segnali finanziari (MiFID II / TUF):**
- Output IDENTICO per tutti gli utenti (mai personalizzato su patrimonio del singolo)
- MAI le parole "consiglio", "raccomando", "dovresti"
- SEMPRE: "il modello indica", "segnale algoritmico", "analisi tecnica"
- Disclaimer prominenti e ripetuti
- NON raccogliamo dati sul patrimonio per calibrare i segnali
- ATTENZIONE: la modalita Copilot deve essere formulata con cura per non configurare consulenza personalizzata

**Tassazione (aggiornata 2026):**

| Area | Regime fiscale Italia |
|---|---|
| Scommesse (Betfair) | Verificare status ADM. Se non ADM: redditi diversi |
| Polymarket | Redditi diversi (26% plusvalenze) — zona grigia crypto-based |
| Azioni | 26% capital gain |
| Forex | 26% plusvalenze |
| Crypto | **33% plusvalenze (dal 1 gennaio 2026)**, nessuna soglia di esenzione |

Riferimento crypto: Legge di Bilancio 2025 (L. 207/2024, art. 1 commi 24-29)

**Modulo fiscale nella piattaforma:**
- Tracking automatico profitti/perdite per area con separazione fiscale
- Report annuale scaricabile per il commercialista
- Calcolo automatico tasse stimate
- Alert quando si avvicina una soglia fiscale rilevante
- Disclaimer: "non costituisce consulenza fiscale"

### 15.3 Questionario utente obbligatorio

Alla registrazione, OBBLIGATORIO:

```
1. Eta >= 18 anni (verifica obbligatoria)
2. Paese di residenza (determina normativa applicabile)
3. Esperienza strumenti finanziari: Nessuna / Base / Intermedia / Avanzata
4. Esperienza scommesse sportive: Nessuna / Occasionale / Regolare
5. Comprensione rischio: "Il capitale puo essere perso totalmente. Comprendi?"
   → Se No: blocco accesso funzioni live
6. Fonte dei fondi: Reddito / Risparmi / Altro
7. Quanto puoi permetterti di perdere? <100 / 100-1.000 / 1.000-10.000 / >10.000 EUR
   → Questo imposta il limite massimo di bankroll live
```

### 15.4 Multi-paese — approccio graduale

**Fase 1 (lancio)**: SOLO ITALIA

**Fase 2**: paesi EU semplici (Spagna, Germania, Francia) — stessa base GDPR/MiFID

**Fase 3**: UK (serve attenzione FCA/Gambling Commission)

**MAI senza legale dedicato**: USA, Cina

**Architettura multi-paese:**
- Geoblocking basato su paese dichiarato + IP check secondario
- Disclaimer localizzati per paese
- Configurazione normativa per paese (aree visibili/nascoste, limiti, avvisi)
- Il codice e pronto per espandersi, ma non ci esponiamo dove non siamo coperti

### 15.5 Disclaimer obbligatori (ovunque nella piattaforma)

- "Elio.Market non fornisce consulenza finanziaria personalizzata"
- "Le performance passate non garantiscono risultati futuri"
- "Il capitale investito puo essere perso totalmente"
- "L'utente e il solo responsabile delle proprie decisioni"
- "Il gioco d'azzardo puo causare dipendenza — Numero verde: 800-558822"
- "Elio.Market non e un operatore di gioco e non gestisce scommesse"
- Conforme alle normative gambling del paese dell'utente (responsabilita dell'utente verificare)

### 15.6 Requisito pre-lancio

**OBBLIGATORIO**: parere legale professionale da studio specializzato in fintech/gambling PRIMA di andare live.
Aree critiche: Decreto Dignita, confine consulenza finanziaria, ToS.

---

## 16. PRIVACY E DATI

### 16.1 GDPR compliance

- Privacy by design e by default (art. 25 GDPR)
- DPIA (Valutazione d'Impatto) obbligatoria prima del lancio
- Informativa trasparente su tutti i dati raccolti
- Minimizzazione: solo dati strettamente necessari
- Data breach: notifica Garante entro 72 ore, utente senza ritardo
- Export totale dati in qualsiasi momento
- Cancellazione reale (non nascosta) alla richiesta
- API key broker criptate AES-256 e distrutte alla cancellazione account

### 16.2 Dati e strategie utente

- Le strategie dell'utente sono SUE
- Dati performance aggregati e anonimi: raccolti SEMPRE (non identificabili)
- Dati anonimi strategie per migliorare AI: raccolti con OPT-IN esplicito alla registrazione
- Chi accetta: alimenta il modello AI globale, riceve analisi migliori, puo revocare
- MAI vendere dati individuali identificabili
- MAI usare dati per competere con l'utente
- MAI condividere con terzi senza consenso esplicito separato

### 16.3 Conformita globale

L'obiettivo e essere conformi in tutti i paesi in cui operiamo.
Approccio graduale: un paese alla volta, con copertura legale verificata.

---

## 17. ONBOARDING UTENTE

```
Step 1: Registrazione (email + password o social login)
Step 2: Questionario obbligatorio (sezione 15.3)
Step 3: "Cosa ti interessa?"
         [] Scommesse sportive (Betfair)
         [] Prediction markets (Polymarket)
         [] Azioni e ETF
         [] Forex
         [] Crypto
         → Attiva solo le aree selezionate (le altre nascoste, attivabili dopo)

Step 4: "Quanto sei esperto?"
         o Principiante → Autopilot, interfaccia semplificata
         o Intermedio → Copilot (default)
         o Esperto → Manual, interfaccia completa

Step 5: Imposta bankroll simulato per paper trading
Step 6: L'AI propone 5 strategie starter per le aree scelte
         → L'utente le attiva in paper trading
         → Operativo dal giorno 1
```

Tempo onboarding target: 2 minuti.

---

## 18. DISASTER RECOVERY

- Backup database: ogni 6 ore automatico, retention 30 giorni
- Stato posizioni: sincronizzato con broker ogni 5 minuti
- Se DB si corrompe: ricostruzione dalle API broker
- Telegram bot: servizio separato, funziona anche se la web app e down
- Recovery automatico: se un servizio crasha, si riavvia
- Kill switch: accessibile anche se tutto il resto e down
- Per ogni servizio esterno: DEVE esistere un piano B. Zero single point of failure

| Servizio | Piano B |
|---|---|
| Betfair API down | Adapter pronto per Smarkets/Betdaq |
| Polymarket bannato in EU | Adapter per Kalshi |
| Broker API offline | Polling backup ogni 5min + stato cached + alert |
| Crollo generalizzato | Circuit breaker globale: drawdown > X% in 24h → tutto in pausa |
| Bug esecuzione | Validation layer pre-ordine: controlla limiti, coerenza, rate |

---

## 19. COMMISSIONI PER PIATTAFORMA

Questi valori DEVONO essere integrati in ogni backtest e simulazione:

| Piattaforma | Commissione |
|---|---|
| Betfair Exchange | 5% sui profitti netti per mercato |
| Polymarket | Spread bid/ask + gas fees minimi |
| DeGiro | 0 EUR su ETF core, 1-3 EUR/operazione altri |
| Interactive Brokers | 0.05% minimo |
| Forex (MT5 IC Markets) | Spread + 3$/lotto |
| Binance spot | 0.1% |
| Bybit futures | 0.02-0.04% |

---

## 20. ROADMAP

| Milestone | Descrizione |
|---|---|
| **M0** | Infrastruttura base: auth, DB, architettura modulare, CI/CD, sicurezza |
| **M1** | Polymarket: dati, analisi AI, paper trading, dashboard |
| **M2** | Betfair: dati, analisi, trading sportivo, paper trading |
| **M3** | Crypto: spot/futures, arbitraggio Polymarket, paper trading |
| **M4** | Azioni: DeGiro/IB, ETF, opzioni, paper trading |
| **M5** | Forex: MT5 integration, paper trading |
| **M6** | Cross-area: correlation engine, meta-dashboard, modulo fiscale |
| **M7** | Beta pubblica: onboarding, multi-utente, Telegram bot completo |
| **M8** | Monetizzazione: abbonamenti, copy trading, marketplace strategie |

Ogni milestone e autosufficiente. Alla fine di M1, la piattaforma e gia usabile per Polymarket.

---

## 21. PRINCIPI INVIOLABILI

1. **Il capitale dell'utente e sacro**. Ogni decisione di design protegge il capitale prima di tutto
2. **Trasparenza totale**. Nessun dato nascosto, nessuna performance falsificata
3. **L'AI e un collaboratore, non un decisore**. L'utente ha sempre l'ultima parola
4. **Nessuna strategia va live senza backtest + paper trading**. NESSUNA ECCEZIONE
5. **Le commissioni sono parte del risultato**. Profitto lordo non esiste in questa piattaforma
6. **Zero single point of failure**. Piano B per ogni dipendenza esterna
7. **Privacy by design**. I dati dell'utente sono suoi. Sempre
8. **Compliance first**. Se un'azione e legalmente dubbia, non la facciamo
9. **Il codice e in inglese, l'interfaccia in italiano** (predisposta per i18n)
10. **Questo file e la bibbia**. Ogni decisione deve essere coerente con quanto scritto qui

---

*Elio.Market — Al centro di tutti i mercati.*
