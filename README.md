# FitLog

Český tréninkový deník pro Honzu a Davida. React 19, TypeScript, Vite, Supabase a instalovatelná PWA. Čtyři sekce: Trénink, Historie, Progres a Cviky. Tmavý i světlý vzhled, vlastní fotografie, CSV export a průběžné lokální ukládání rozepsaných sérií.

## Spuštění

Potřebujete Node.js 22 nebo novější (ověřeno na Node.js 24) a npm.

```sh
cd /workspace/fitko
npm ci
npm run dev
```

Vite vypíše adresu serveru. Na vlastním počítači aplikaci otevřete v prohlížeči na portu 5173. Telefon připojte ke stejné Wi-Fi a otevřete `http://IP-POČÍTAČE:5173`. Firewall musí povolit tento port. Adresa serveru ve vzdáleném cloudovém prostředí není automaticky dostupná z telefonu; pro běžné použití nasaďte aplikaci na HTTPS.

Bez proměnných Supabase se automaticky spustí jasně označené demo. Jeho testovací historie a oba editovatelné profily žijí pouze v tomto prohlížeči. Demo se nikdy automaticky nepřenáší do produkce. Fotografie se zmenšují na nejvýše 1000 px a ukládají jednou ke cviku. Data prohlížeče mohou být odstraněna systémem; pro skutečné dlouhodobé záznamy použijte Supabase a pravidelný CSV export.

## Připojení Supabase

1. Vytvořte projekt na Supabase (pro dva uživatele obvykle stačí bezplatný tarif; jeho aktuální limity a uspávání projektu řídí poskytovatel).
2. V SQL editoru jednou spusťte celý soubor `supabase/001_fitlog.sql`. Vytvoří tabulky, RPC, RLS, počáteční cyklus, knihovnu cviků a Storage bucket. Nevkládá žádné fiktivní výkony.
3. V Authentication → Users vytvořte dva uživatele s e-mailem a heslem, potvrďte jejich e-maily. V nastavení Authentication vypněte veřejnou registraci. Aplikace registraci neobsahuje.
4. UUID těchto dvou účtů vložte přes SQL editor do profilů:

```sql
insert into public.profiles (id, name) values
('UUID-UCTU-HONZY', 'Honza'),
('UUID-UCTU-DAVIDA', 'David');
```

Unikátní názvy a omezení tabulky povolují pouze tyto dva profily. Neprofilovaný účet nemá přístup k datům. Nevytvářejte obecnou politiku umožňující přístup všem.

5. Zkopírujte `.env.example` do `.env.local` a doplňte URL projektu a veřejný anon/publishable klíč:

```dotenv
VITE_SUPABASE_URL=https://VAS-PROJEKT.supabase.co
VITE_SUPABASE_ANON_KEY=VAS_VEREJNY_KLIC
```

Do klienta nikdy nevkládejte `service_role`, secret key ani heslo databáze. Vite tyto hodnoty zabudovává při sestavení; po změně je nutný restart vývoje nebo nové sestavení. `.env.local` se necommituje.

6. Restartujte aplikaci. Zobrazí se přihlášení místo dema. Přihlaste se každý svým účtem. Oba mohou číst výsledky obou, změny výkonů jsou povolené pouze vlastníkovi. Knihovna cviků a plán jsou sdílené. Fotografie cviků mají veřejné URL; bucket je určen pro obrázky vybavení a cviků.
7. Ověřte ze dvou telefonů zápis a dokončení stejného kola, obnovení dat v Nastavení, nahrání fotografie a odmítnutí změny cizích výsledků. Toto ověření na vašem skutečném projektu zatím nebylo provedeno.

### Jak funguje společný cyklus a offline zápis

Kolo má vlastní UUID. Den cyklu není kalendářní datum. První dokončení zamkne kolo v databázové transakci, označí jej jako posunuté a vytvoří další den. Druhému profilu zachová nedokončený trénink stejného kola. Jeho následné dokončení cyklus podruhé neposune. Po dni 12 následuje den 1. Ruční změna v Nastavení vytváří nové společné kolo; staré záznamy nemaže.

Každá změna pole se ukládá lokálně. Tlačítka Uložit / Dokončit odešlou celý vlastní trénink transakčně do Supabase. Neúspěšný přenos nemaže místní koncept. Po návratu připojení jej odešlete znovu; starší rozepsané tréninky najdete v Nastavení, kde lze pokračovat v zápisu nebo odeslat kompletní záznam. Online data lze obnovit tlačítkem v Nastavení. Aplikace nepředstírá automatickou synchronizaci na pozadí ani průběžný realtime přenos každého stisku klávesy.

Dva různé účty ukládají do různých řádků, takže se nepřepisují. Současná editace jednoho účtu na více telefonech není podporovaným způsobem práce (poslední potvrzené uložení vyhrává). Odhlášení ponechává místní koncepty pro pozdější obnovení; na sdíleném zařízení po práci vymažte data webu.

## Android a nasazení

```sh
npm test
npm run build
npm run preview
```

Nahrajte obsah `dist/` na statický HTTPS hosting, například Cloudflare Pages, Netlify nebo Vercel; ověřte aktuální podmínky jejich bezplatných tarifů. Build command: `npm run build`, výstup: `dist`. V prostředí hostingu nastavte obě proměnné `VITE_SUPABASE_*` před buildem. Pro použití kořenové cesty je konfigurace již připravená.

Na Androidu otevřete HTTPS adresu v Chrome → nabídka ⋮ → **Nainstalovat aplikaci** nebo **Přidat na plochu**. Manifest obsahuje ikony 192/512 px, aplikace má samostatné okno a service worker pro offline otevření již načtené aplikace. PWA se při `npm run dev` neregistruje; ověřujte ji z produkčního sestavení. Instalace a fotoaparát vyžadují HTTPS (výjimkou je localhost přímo na stejném zařízení). První přihlášení a první načtení online dat vyžaduje připojení.

## Testy a struktura

- `npm test`: pravidla všech 12 dní, střídání cviků, desetinné váhy, tři série; skutečné provedení SQL v lokálním PostgreSQL enginu PGlite, rollback chybného zápisu, oddělení profilů, RLS a idempotentní dokončení společného kola.
- `npm run test:e2e`: mobilní Chromium, zápis / reload / dokončení obou profilů / knihovna / historie / progres. Nejprve spusťte `npm run dev`. Konfigurace v tomto cloudovém prostředí používá `/usr/bin/chromium`; na jiném stroji upravte `executablePath` nebo jej odeberte a spusťte `npx playwright install chromium`.
- `src/domain.ts`: pravidla a typy; `src/storage.ts`: persistence a Supabase; `src/main.tsx`: obrazovky; `src/style.css`: responzivní vzhled; `supabase/001_fitlog.sql`: databázová migrace.

Lokální databázový test nenahrazuje integraci se skutečným Supabase Auth, Storage ani test dvou fyzických telefonů. Nasazení a instalace na skutečném Androidu se musí ověřit na cílové HTTPS adrese.

Pro opakování produkčního offline testu spusťte také `npm run preview` a pak `FITLOG_PWA_TEST=1 npm run test:e2e`.
