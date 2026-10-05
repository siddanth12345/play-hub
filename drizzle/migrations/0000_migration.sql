CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  settings jsonb,
  training jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower ON public.profiles (lower(username));
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.protect_username() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.username := OLD.username; NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER profiles_protect BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_username();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u text := NEW.raw_user_meta_data->>'username';
BEGIN
  IF u IS NULL OR u !~ '^[A-Za-z0-9_]{3,20}$' THEN RAISE EXCEPTION 'Invalid username'; END IF;
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, u);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.username_available(_u text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(_u))
$$;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;