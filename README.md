# TV Studio Supabase Integration

Questa cartella contiene un esempio di integrazione con Supabase per gestire un palinsesto che riproduce video/audio e li elimina dopo la riproduzione.

## Come configurare Supabase

1. Crea un progetto Supabase.
2. Crea una tabella `palinsesto` con questa struttura:

```sql
create table palinsesto (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  url text not null,
  scheduled_at timestamptz not null,
  created_at timestamptz default now()
);
```

4. Crea un bucket Supabase Storage pubblico chiamato `schedule-media` per caricare i file video/audio che userai nel palinsesto.

5. Abilita `uuid-ossp` o `pgcrypto` se necessario per generare UUID.

## Permessi

Per funzionare con la chiave anonima frontend, usa policy RLS che consentono le operazioni desiderate su `palinsesto`.

Esempio di policy per `public`:

- SELECT: `true`
- INSERT: `true`
- DELETE: `true`

> In produzione, è consigliato proteggere meglio le policy e usare una API backend con la chiave di servizio, invece della sola chiave anonima sul client.

## File importanti

- `index.html`: viewer del canale.
- `studio.html`: interfaccia del regista con aggiunta/rimozione palinsesto.
- `supabase-client.js`: inizializza Supabase e gestisce fetch/insert/delete.
- `studio.js`: carica e sincronizza il palinsesto, crea i programmi in Supabase.
- `viewer.js`: recupera il palinsesto da Supabase, riproduce i programmi e rimuove gli elementi già riprodotti.

## Note

- L'URL Supabase e la chiave anonima sono già preimpostati nelle pagine HTML.
- Se vuoi cambiare le chiavi, modifica le variabili `window.SUPABASE_URL` e `window.SUPABASE_ANON_KEY` in `studio.html` e `index.html`.
