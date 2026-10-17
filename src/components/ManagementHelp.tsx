import { useState } from "react";
import { linkDavidSql } from "../profiles";
import type { Person } from "../domain";
const base = "https://supabase.com/dashboard/project/dzrbtoxrfjvssaugqmhn";
export function ManagementHelp({
  availablePeople,
  davidLinked = false,
}: {
  availablePeople: Person[];
  davidLinked?: boolean;
}) {
  const [email, setEmail] = useState(""),
    [sql, setSql] = useState(""),
    [copied, setCopied] = useState(false);
  return (
    <details className="management-help">
      <summary>Správa aplikace a přidání Davida</summary>
      <p>
        Pro cvičení potřebujete pouze FitLog. Tyto odkazy slouží ke správě; účty
        správců nejsou totéž co přihlášení do deníku.
      </p>
      <div className="management-links">
        <a
          href="https://teal-quokka-94249f.netlify.app"
          target="_blank"
          rel="noreferrer"
        >
          FitLog — tréninkový deník
        </a>
        <a
          href="https://app.netlify.com/sites/teal-quokka-94249f/overview"
          target="_blank"
          rel="noreferrer"
        >
          Netlify — zveřejnění aplikace
        </a>
        <a href={base + "/auth/users"} target="_blank" rel="noreferrer">
          Supabase — přihlašovací účty
        </a>
        <a href={base + "/sql/new"} target="_blank" rel="noreferrer">
          Supabase — SQL editor databáze
        </a>
        <a
          href="https://github.com/mazlfranta9-maker/fitko"
          target="_blank"
          rel="noreferrer"
        >
          GitHub — kód aplikace a návod
        </a>
      </div>
      <details>
        <summary>Aktualizace databáze pro průběžné série</summary>
        <p>
          Pokud průběžné ukládání hlásí chybějící funkci, spusťte v SQL editoru
          celý soubor 004. Soubor 004 obsahuje také předchozí opravy 002 a 003.
          Původní soubor 001 znovu nespouštějte.
        </p>
        <div className="management-links">
          <a
            href="https://github.com/mazlfranta9-maker/fitko/blob/main/supabase/003_shared_editing.sql"
            target="_blank"
            rel="noreferrer"
          >
            003 — vzájemné zapisování
          </a>
          <a
            href="https://github.com/mazlfranta9-maker/fitko/blob/main/supabase/004_live_sets.sql"
            target="_blank"
            rel="noreferrer"
          >
            004 — průběžné ukládání sérií
          </a>
        </div>
      </details>
      <div className="management-links">
        <a
          href="https://github.com/mazlfranta9-maker/fitko/blob/main/supabase/005_profiles_without_login.sql"
          target="_blank"
          rel="noreferrer"
        >
          005 — přepínání profilů před založením Davidova účtu
        </a>
      </div>
      <h3>Přístup pro Davida</h3>
      <p>
        {davidLinked
          ? "David má vlastní přihlášení. Jeho dosavadní výsledky zůstávají u profilu David."
          : availablePeople.includes("David")
            ? "Profil David je připravený. Můžete mu ihned zapisovat přepínačem Honza / David bez zadání e-mailu a hesla. Vlastní přihlášení mu můžete připojit později."
            : "Pro okamžité přepínání nejprve spusťte aktualizaci 005 v Supabase. Davidův e-mail zatím není potřeba."}
      </p>
      <p>
        Následující kroky jsou potřeba až pro Davidovo vlastní přihlášení na
        jeho telefonu. Nepřesouvají ani nemažou výsledky. Po přihlášení oba
        vidíte i upravujete Honzu i Davida.
      </p>
      <ol>
        <li>
          V odkazu „Supabase — přihlašovací účty“ zvolte Add user → Create new
          user.
        </li>
        <li>
          Zadejte Davidův e-mail a heslo pro FitLog. Zapněte Auto Confirm User.
          Heslo zadávejte pouze v Supabase a předejte ho Davidovi soukromě.
        </li>
        <li>
          Sem zadejte stejný e-mail. Vygenerovaný SQL zkopírujte do SQL editoru
          Supabase a spusťte přes Run.
        </li>
        <li>
          Po hlášce Success obnovte online data v Nastavení. David pak otevře
          stejný odkaz FitLogu na telefonu a přihlásí se vlastním účtem.
        </li>
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSql(linkDavidSql(email));
          setCopied(false);
        }}
      >
        <label>
          Davidův e-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSql("");
            }}
            autoComplete="off"
          />
        </label>
        <button type="submit" className="secondary">
          Připravit propojení Davida
        </button>
      </form>
      {sql && (
        <>
          <p>
            Tento text vložte do nového dotazu v SQL editoru. Původní velkou
            migraci znovu nespouštějte.
          </p>
          <textarea
            aria-label="SQL pro propojení Davida"
            readOnly
            value={sql}
          />
          <button
            type="button"
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sql);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Zkopírováno" : "Kopírovat SQL"}
          </button>
        </>
      )}
    </details>
  );
}
