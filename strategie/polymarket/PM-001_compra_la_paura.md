# PM-001 — Compra la Paura, Vendi lo Spike

> **Stato**: Da backtestare
> **Versione**: v1
> **Creata**: 19 marzo 2026
> **Origine**: Strategia personale del fondatore, sviluppata prima di Elio.Market

---

## Regola d'oro

**COMPRA LA PAURA, VENDI LO SPIKE.**

---

## 1. Filosofia

- Non serve che l'evento si avveri. Basta che la quota si muova
- Swing trading sulle quote, NON scommesse sull'esito finale
- Compriamo quando la paura e a sconto, vendiamo quando il mercato reagisce alla news

---

## 2. Filtri di ingresso

```
FILTRA_MERCATI:
  prezzo:           >= $0.05 E <= $0.45
  volume_totale:    > $100K
  scadenza:         <= 30 giorni (preferenza < 15)
  catalizzatore:    imminente (entro 48h — 7 giorni)
  news_flow:        attivo e costante (EVITARE mercati senza news)

ENTRA_QUANDO:
  - Prezzo in calo su evento con fondamentali invariati (paura irrazionale)
  - OPPURE breaking news crea opportunita' immediata
  - AGIRE SUBITO — non pensarci sopra
```

---

## 3. Regole di uscita progressiva

| Guadagno sulla quota | Azione |
|---|---|
| +50% | Vendere 1/3 (proteggi capitale) |
| +100% (2x) | Vendere 1/2 (profitto garantito) |
| +200% (3x) | Vendere tutto tranne piccola parte "lottery" |
| -30% | Stop loss — rivaluta la tesi |

---

## 4. Money management

| Tier | Allocazione | Descrizione |
|---|---|---|
| Tier 1 | 50% bankroll | Alta convinzione |
| Tier 2 | 30% bankroll | Speculativi ragionati |
| Tier 3 | 20% bankroll | Lottery |

- Mai all-in su un singolo trade
- Tenere SEMPRE 20% di liquidita per spike improvvisi
- **Circuit breaker**: se perdi 50% del bankroll totale, FERMATI e rivaluta tutto

---

## 5. Correlazione e macro-tesi

- Tutti i trade devono essere alimentati dalla stessa macro-tesi
- Un singolo evento muove piu trade contemporaneamente = leva naturale
- Se la macro-tesi cambia → USCIRE DA TUTTO il cluster, non solo un trade

---

## 6. Errori vietati

- NON tenere fino a scadenza per principio — il profitto e nella volatilita
- NON comprare quote sopra $0.50 — rendimento non giustifica il rischio
- NON fare media al ribasso su un trade che perde
- NON tradare senza catalizzatore — senza news la quota muore
- NON ignorare il volume — basso volume = non riesci a uscire
- NON innamorarti di un trade — se la tesi si rompe, ESCI

---

## 7. Parametri da backtestare (varianti)

Per il backtest, testare queste variazioni per trovare la combinazione ottimale:

| Parametro | Valore base | Varianti da testare |
|---|---|---|
| Soglia prezzo minima | $0.05 | $0.03, $0.08, $0.10 |
| Soglia prezzo massima | $0.45 | $0.35, $0.40, $0.50 |
| Volume minimo | $100K | $50K, $200K, $500K |
| Scadenza massima | 30 giorni | 7, 15, 45, 60 giorni |
| Stop loss | -30% | -20%, -25%, -35%, -40% |
| Take profit 1 (1/3) | +50% | +30%, +40%, +60% |
| Take profit 2 (1/2) | +100% | +75%, +80%, +120% |
| Take profit 3 (tutto) | +200% | +150%, +180%, +250% |
| Liquidita cash | 20% | 10%, 15%, 25%, 30% |

Ogni combinazione genera una variante (PM-001-v1a, PM-001-v1b, ecc.) da testare nei 4 livelli di backtest.
