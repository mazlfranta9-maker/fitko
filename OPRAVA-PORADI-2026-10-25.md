# Volné pořadí cviků při střídání Honzy a Davida

Původní `nextTurn` prohledával všechny série od právě potvrzené pozice dál a po konci seznamu pokračoval od začátku. Když si oba odcvičili lýtka před rameny, po poslední sérii lýtek vybral první prázdnou sérii břicha. Pokud už měl Honza lýtka hotová, přeskočil na jiný cvik i v okamžiku, kdy Davidovi ještě zbývaly jeho vlastní série. `passTurn` navíc vždy přepínal na druhého, bez ohledu na profil vrácený rozhodovací funkcí.

Oprava omezuje předávání na právě zvolený cvik. Jakmile má partner hotovo, zůstane aktuální profil a zvýrazní se jeho další nevyplněná série téhož cviku. Po dokončení obou aplikace oznámí, že si mohou další cvik vybrat sami; automaticky neposouvá na jinou kartu. Zaměření pole váhy nebo opakování označí skutečně zvolenou sérii. Zobrazené pořadí karet se nemění a nevynucuje pořadí cvičení.

Obnovení na pozadí při návratu do aplikace nadále načítá online výsledky, ale nepřepíná profil ani zvolené kolo. První načtení a výslovná změna dne/kola zůstávají funkční. David dál přebírá Honzovy cviky a má vlastní hodnoty.

## Ověření

- Regresní testy nejprve prokázaly chybu: po lýtkách se vracelo břicho místo ukončení cviku nebo další Davidovy série lýtek.
- Build a všech 32 jednotkových/databázových testů prošlo.
- Nové E2E scénáře: všech šest sérií lýtek před rameny; ruční přechod na ramena; zachování hodnot po znovunačtení; Honza má hotovo a David pokračuje sám; návrat do aplikace při existenci jiného novějšího kola.
- Síťové a SQL testy jsou izolované; při opravě se nezasahuje do produkčních dat.

## Nasazení

Tentokrát není potřeba žádné nové SQL. Po sloučení návrhu změny do `main` Netlify sestaví stejný web se stávajícími proměnnými prostředí. Po zeleném Published otevřete aplikaci online a nechte doběhnout aktualizaci PWA. V Nastavení musí být **2026.10.25 · volné pořadí cviků**. Nic neodinstalovávejte a nemažte localStorage.

Kontrola v praxi: zvolte lýtka (karta 8 dne nohou/ramen), vyplňujte a předávejte série oběma profilům. Po třetí Davidově sérii zůstane aplikace u lýtek a nabídne vlastní výběr dalšího cviku. Potom přejděte na libovolnou kartu ramen a pokračujte. Staré série ani tréninková kola není třeba měnit či slučovat.
