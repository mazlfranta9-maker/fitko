import { useState } from "react";
import type { Person } from "../domain";
const base = "https://supabase.com/dashboard/project/dzrbtoxrfjvssaugqmhn";
export function ManagementHelp({
  availablePeople,
}: {
  availablePeople: Person[];
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
      <h3>Přístup pro Davida</h3>
      <p>
        {availablePeople.includes("David")
          ? "Profil David je propojený s účtem. David se přihlašuje vlastním e-mailem a heslem."
          : "David zatím nemá připojený profil."}
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
          const value = email.trim().replaceAll("'", "''");
          setSql(
            `DO $$\nDECLARE account_id uuid;\nBEGIN\n SELECT id INTO account_id FROM auth.users WHERE lower(email) = lower('${value}');\n IF account_id IS NULL THEN RAISE EXCEPTION 'Nejprve vytvořte tento účet v Authentication → Users'; END IF;\n IF EXISTS (SELECT 1 FROM public.profiles WHERE name = 'David' AND id <> account_id) THEN RAISE EXCEPTION 'David už je propojen s jiným účtem. Stávající profil nemažte.'; END IF;\n IF EXISTS (SELECT 1 FROM public.profiles WHERE id = account_id AND name <> 'David') THEN RAISE EXCEPTION 'Tento účet patří Honzovi. Pro Davida použijte jiný e-mail.'; END IF;\n INSERT INTO public.profiles(id,name) VALUES(account_id,'David') ON CONFLICT(id) DO NOTHING;\nEND $$;`,
          );
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
