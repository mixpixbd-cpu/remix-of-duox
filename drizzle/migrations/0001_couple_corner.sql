CREATE TABLE public.couple_corner (
  pair_id uuid PRIMARY KEY REFERENCES public.pairs(id) ON DELETE CASCADE,
  pet jsonb NOT NULL DEFAULT '{}'::jsonb,
  garden jsonb NOT NULL DEFAULT '{}'::jsonb,
  dates jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.couple_corner TO authenticated;
GRANT ALL ON public.couple_corner TO service_role;
ALTER TABLE public.couple_corner ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read corner" ON public.couple_corner FOR SELECT TO authenticated USING (public.is_pair_member(pair_id, auth.uid()));
CREATE POLICY "members add corner" ON public.couple_corner FOR INSERT TO authenticated WITH CHECK (public.is_pair_member(pair_id, auth.uid()));
CREATE POLICY "members update corner" ON public.couple_corner FOR UPDATE TO authenticated USING (public.is_pair_member(pair_id, auth.uid())) WITH CHECK (public.is_pair_member(pair_id, auth.uid()));