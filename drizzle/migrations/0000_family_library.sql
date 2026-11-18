CREATE TABLE public.feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id uuid NOT NULL REFERENCES public.pairs(id) ON DELETE CASCADE,
  added_by uuid NOT NULL,
  category text NOT NULL,
  kind text NOT NULL,
  title text,
  file_path text NOT NULL,
  file_type text,
  poster_path text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feed_items_pair_idx ON public.feed_items(pair_id, category, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.feed_items TO authenticated;
GRANT ALL ON public.feed_items TO service_role;
ALTER TABLE public.feed_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.feed_relaxed(_pair uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; r jsonb;
BEGIN
  SELECT settings INTO s FROM public.pair_controls WHERE pair_id = _pair;
  IF s IS NULL OR coalesce((s->>'g_feed_relax')::boolean, false) = false THEN RETURN false; END IF;
  r := s->'t_feedrelax';
  IF r IS NULL OR r->>'mode' = 'unlimited' THEN RETURN true; END IF;
  IF r->>'mode' = 'until' THEN RETURN now() < (r->>'until')::timestamptz; END IF;
  IF r->>'mode' = 'schedule' THEN RETURN now() >= (r->>'start')::timestamptz AND now() < (r->>'end')::timestamptz; END IF;
  RETURN false;
END $$;

CREATE POLICY "owner reads all feed" ON public.feed_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner') AND public.is_pair_member(pair_id, auth.uid()));
CREATE POLICY "partner reads safe feed" ON public.feed_items FOR SELECT TO authenticated
  USING (public.is_pair_member(pair_id, auth.uid()) AND (status = 'safe' OR (status <> 'blocked' AND public.feed_relaxed(pair_id)) OR added_by = auth.uid()));
CREATE POLICY "members add feed" ON public.feed_items FOR INSERT TO authenticated
  WITH CHECK (added_by = auth.uid() AND public.is_pair_member(pair_id, auth.uid()));
CREATE POLICY "owner deletes feed" ON public.feed_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') AND public.is_pair_member(pair_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.feed_items_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.status := 'pending'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER feed_items_before_insert_trg BEFORE INSERT ON public.feed_items
  FOR EACH ROW EXECUTE FUNCTION public.feed_items_before_insert();