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
2. V SQL editoru jednou spusťte celý soubor `supabase/001_fitlog.sql`. Vytvoří tabulky, RPC, RLS, počáteční cyklus, knihovnu cviků a Storage bucket. Nevkládá žádné fiktivní výkony. Potom spusťte `supabase/003_shared_editing.sql`, který povoluje vzájemné zapisování Honzy a Davida, a `supabase/004_live_sets.sql` pro průběžné ukládání sérií.
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

6. Restartujte aplikaci. Zobrazí se přihlášení místo dema. Přihlaste se každý svým účtem. Oba mohou číst, zapisovat, opravovat i mazat výsledky obou profilů. Výsledek vždy zůstává přiřazen zvolenému cvičícímu, nikoli účtu, který jej zapsal. Knihovna cviků a plán jsou sdílené. Fotografie cviků mají veřejné URL; bucket je určen pro obrázky vybavení a cviků.
7. Ověřte ze dvou telefonů zápis a dokončení stejného kola, obnovení dat v Nastavení, nahrání fotografie a odmítnutí přístupu účtu bez profilu Honza/David. Toto ověření na vašem skutečném projektu zatím nebylo provedeno.

### Jak funguje společný cyklus a offline zápis

Kolo má vlastní UUID. Den cyklu není kalendářní datum. První dokončení zamkne kolo v databázové transakci, označí jej jako posunuté a vytvoří další den. Druhému profilu zachová nedokončený trénink stejného kola. Jeho následné dokončení cyklus podruhé neposune. Po dni 12 následuje den 1. Ruční změna v Nastavení vytváří nové společné kolo; staré záznamy nemaže.

Každá změna pole se ihned ukládá lokálně. Po přibližně 700 ms bez psaní se změněné série automaticky odešlou do Supabase, i když zbytek tréninku ještě není vyplněný. Fronta odesílá změny jednotlivých sérií, nikoliv celý zastaralý snímek tréninku. Při výpadku zůstává rozepsaný zápis i fronta v telefonu; po návratu připojení se přenos opakuje automaticky. Tlačítko Uložit vyvolá okamžité odeslání, Dokončit vyžaduje všechny tři série všech cviků. Stav zobrazuje „Ukládám online“, „Uloženo online“ nebo „Uloženo v telefonu · čeká na odeslání“. Data z druhého telefonu se načítají přibližně každých 10 sekund bez změny právě vybraného člověka a série. Nejde o stream každého stisku klávesy na všech zařízeních.

Dva různé účty ukládají do různých řádků, takže se nepřepisují. Oba můžete zapisovat na obou telefonech. Změna jiné série nebo druhého profilu nepřepíše zbytek tréninku. Pokud upravíte tutéž sérii téhož člověka na obou telefonech současně, platí poslední úspěšné uložení. Odhlášení ponechává místní koncepty pro pozdější obnovení; na sdíleném zařízení po práci vymažte data webu.

## Android a nasazení

```sh
npm test
npm run build
npm run preview
```

Nahrajte obsah `dist/` na statický HTTPS hosting, například Cloudflare Pages, Netlify nebo Vercel; ověřte aktuální podmínky jejich bezplatných tarifů. Build command: `npm run build`, výstup: `dist`. V prostředí hostingu nastavte obě proměnné `VITE_SUPABASE_*` před buildem. Pro použití kořenové cesty je konfigurace již připravená.

Na Androidu otevřete HTTPS adresu v Chrome → nabídka ⋮ → **Nainstalovat aplikaci** nebo **Přidat na plochu**. Manifest obsahuje ikony 192/512 px, aplikace má samostatné okno a service worker pro offline otevření již načtené aplikace. PWA se při `npm run dev` neregistruje; ověřujte ji z produkčního sestavení. Instalace a fotoaparát vyžadují HTTPS (výjimkou je localhost přímo na stejném zařízení). První přihlášení a první načtení online dat vyžaduje připojení.

## Testy a struktura

- `npm test`: pravidla všech 12 dní, seskupení cviků podle partií, desetinné váhy, tři série; skutečné provedení SQL v lokálním PostgreSQL enginu PGlite, rollback chybného zápisu, oddělení profilů, RLS a idempotentní dokončení společného kola.
- `npm run test:e2e`: mobilní Chromium, zápis / reload / dokončení obou profilů / knihovna / historie / progres. Nejprve spusťte `npm run dev`. Konfigurace v tomto cloudovém prostředí používá `/usr/bin/chromium`; na jiném stroji upravte `executablePath` nebo jej odeberte a spusťte `npx playwright install chromium`.
- `src/domain.ts`: pravidla a typy; `src/storage.ts`: persistence a Supabase; `src/main.tsx`: obrazovky; `src/style.css`: responzivní vzhled; `supabase/001_fitlog.sql`: databázová migrace.

Lokální databázový test nenahrazuje integraci se skutečným Supabase Auth, Storage ani test dvou fyzických telefonů. Nasazení a instalace na skutečném Androidu se musí ověřit na cílové HTTPS adrese.

Pro opakování produkčního offline testu spusťte také `npm run preview` a pak `FITLOG_PWA_TEST=1 npm run test:e2e`.

## Přehled správy pro Honzu a Davida

V aplikaci otevřete ozubené kolečko → **Správa aplikace a přidání Davida**. Najdete tam odkazy na aplikaci, Netlify, Supabase i GitHub a pomocníka pro propojení Davidova e-mailu. Na telefonu je hlavní navigace nahoře a zůstává viditelná při posouvání.

- **FitLog:** každodenní zápis cviků, vah, opakování, historie a progres. Tlačítka Honza/David vybírají, **komu zapisujete výsledky**. Oba přihlášení členové mohou upravovat oba profily; jméno právě přihlášeného účtu vidíte v Nastavení.
- **Supabase:** databáze, fotografie a dva přihlašovací účty. Správcovské přihlášení do Supabase není heslo do FitLogu.
- **GitHub:** zdrojový kód a historie oprav.
- **Netlify:** sestaví kód z GitHubu a zpřístupní web. Proměnné prostředí určují připojení k Supabase.

V prohlížeči si přes Ctrl+D uložte odkazy do společné složky záložek **FitLog**. Aplikaci na Androidu lze nainstalovat z nabídky Chrome.

### Aktualizace již existující databáze

Pro vzájemné zápisy spusťte v Supabase SQL editoru pouze celý soubor `supabase/003_shared_editing.sql`. Je transakční a opakovatelné spuštění je bezpečné; existující tréninky nemaže. Původní `001_fitlog.sql` znovu nespouštějte. Aktualizace kódu na GitHubu sama o sobě SQL v Supabase nespouští.

### Přidání Davidova účtu

1. Supabase → Authentication → Users → Add user → **Create new user**.
2. Zadejte Davidův e-mail, nastavte mu vlastní heslo a zapněte **Auto Confirm User**. Předání hesla řešte soukromě.
3. Ve FitLogu → Nastavení → Správa aplikace zadejte stejný e-mail. Pomocník vytvoří SQL, které propojí existující účet s profilem David. SQL vložte do nového dotazu v Supabase SQL editoru a spusťte Run. Pokud účet chybí nebo profil patří jinému účtu, dotaz změnu odmítne a vypíše důvod.
4. V aplikaci obnovte online data. David otevře stejnou HTTPS adresu aplikace a přihlásí se svým e-mailem a heslem. Ověřte zápis a zobrazení téhož výsledku na druhém telefonu.

Pomocník nemá administrátorský klíč a sám účty nevytváří ani neposílá e-maily. E-mail do pomocníka zadáváte pouze pro vytvoření SQL; neodesílá jej žádné službě.

Pořadí cviků: nejprve 3 cviky první hlavní partie (každý 3 série), potom 3 cviky druhé hlavní partie (každý 3 série), nakonec doplňky. Historické záznamy v původním střídavém pořadí lze nadále opravit; rozepsané tréninky se zobrazí seskupeně bez záměny sérií mezi cviky.

## Střídání Honzy a Davida po jednotlivých sériích

1. Vyberte Honzu a u cviku vyplňte váhu a opakování první série. Zápis se ukládá průběžně.
2. Klepněte na **Zapsat sérii 1 · David →** (nebo použijte Enter v poli opakování). Aplikace ukáže Davida u téhož cviku a série.
3. Po Davidově zápisu zvolte **Zapsat sérii 1 · Honza →**. Jestliže Honza první sérii už má, zvýrazní se jeho druhá série. Stejně pokračujte dál.
4. Horní přepínač Honza/David lze kdykoli použít ručně; nemění den ani cvik. Výsledky obou lidí zůstávají oddělené a po obnovení stránky se obnoví i poslední vybraný člověk a série.
5. Po dokončení všech cviků potvrďte trénink pro oba profily. Dokud je druhý trénink rozepsaný, obrazovka zůstává ve stejném společném kole; databázový cyklus se posune nejvýše jednou.

**Pro již používanou databázi:** spusťte jednou celý soubor `supabase/004_live_sets.sql` v Supabase SQL editoru. Lze jej opakovat; zachovává historii a dovolí u rozepsaných tréninků nevyplněné váhy/opakování. Dokončení neúplného tréninku databáze odmítne. Soubor 004 zahrnuje také předchozí oprávnění a vzájemné zápisy z 002/003, není nutné je před ním znovu spouštět. Bez této aktualizace zůstává automatický zápis ve frontě telefonu a aplikace ukáže chybu; nelze tvrdit, že je uložený online.

Test `src/live-database.test.ts` ověřuje skutečné SQL patch zápisy a nezávislost sérií při zastaralém snímku. `src/autosave.test.ts` ověřuje frontu, souběžnou novější editaci a obnovu po chybě. Prohlížečový test `e2e/autosave.spec.ts` používá řízený testovací transport bez skutečných přihlašovacích údajů; skutečný Supabase projekt a dva telefony je potřeba ověřit po spuštění migrace.
