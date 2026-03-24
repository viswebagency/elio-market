Ciao, riprendiamo il progetto Polymarket. Il file sacro con la strategia completa e' in `/Users/eliomarr/Desktop/Software/Elio.Market/docs/Strategia Polymarket.html` — leggilo prima di tutto.

Due cose da fare in questa sessione:

1. **Rivedere gli scaglioni di uscita per eventi "processo graduale"**. Attualmente sono al 3x/5x/8x ma non li abbiamo validati con dati storici reali come abbiamo fatto per gli eventi improvvisi. Vai a cercare 20-30 casi storici su Polymarket di quote nel range $0.01-$0.20 che si sono mosse gradualmente (politica, economia, approval rating, Fed, elezioni) e analizza: a che livello si fermano tipicamente? Quante raggiungono il 3x? Quante il 5x? Quante il 8x+? I dati devono guidare gli scaglioni, non l'intuizione.

2. **Costruire un sistema automatizzato con le API di Polymarket** che monitora i mercati, identifica opportunita' secondo le nostre 4 categorie, traccia le posizioni e mi manda alert su Telegram quando: una quota nel nostro range ha un volume spike, una posizione aperta raggiunge uno scaglione di uscita, esce una breaking news su un tema che stiamo tracciando. Voglio che il bot faccia il lavoro di monitoraggio e io decido solo se entrare o uscire.
