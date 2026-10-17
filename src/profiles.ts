export type AccountProfile = {
  id: string;
  name: string;
  auth_user_id?: string | null;
};
export function profileForAccount(
  profiles: AccountProfile[],
  accountId: string | undefined,
) {
  return accountId
    ? profiles.find(
        (p) => ("auth_user_id" in p ? p.auth_user_id : p.id) === accountId,
      )
    : undefined;
}
export function hasLogin(profile: AccountProfile | undefined) {
  return (
    !!profile && ("auth_user_id" in profile ? !!profile.auth_user_id : true)
  );
}
export function linkDavidSql(email: string) {
  const value = email.trim().replaceAll("'", "''");
  let delimiter = "$fitlog$";
  while (value.includes(delimiter)) delimiter = delimiter.slice(0, -1) + "_$";
  return `DO ${delimiter}
DECLARE account_id uuid;
BEGIN
 SELECT id INTO account_id FROM auth.users WHERE lower(email) = lower('${value}');
 IF account_id IS NULL THEN RAISE EXCEPTION 'Nejprve vytvořte tento účet v Authentication → Users'; END IF;
 PERFORM 1 FROM public.profiles WHERE name='David' FOR UPDATE;
 IF EXISTS (SELECT 1 FROM public.profiles WHERE name='David' AND auth_user_id IS NOT NULL AND auth_user_id<>account_id) THEN RAISE EXCEPTION 'David už je propojen s jiným účtem. Stávající profil nemažte.'; END IF;
 IF EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id=account_id AND name<>'David') THEN RAISE EXCEPTION 'Tento účet patří Honzovi. Pro Davida použijte jiný e-mail.'; END IF;
 INSERT INTO public.profiles(id,name,auth_user_id) VALUES(gen_random_uuid(),'David',account_id)
 ON CONFLICT(name) DO UPDATE SET auth_user_id=excluded.auth_user_id;
END ${delimiter};`;
}
