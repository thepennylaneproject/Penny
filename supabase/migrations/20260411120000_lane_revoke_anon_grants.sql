-- Harden lane_* tables: remove table privileges from anon.
-- RLS already scopes rows to auth.uid(); authenticated + service_role retain access.

REVOKE ALL ON TABLE public.lane_embeddings FROM anon;
REVOKE ALL ON TABLE public.lane_messages FROM anon;
REVOKE ALL ON TABLE public.lane_runs FROM anon;
REVOKE ALL ON TABLE public.lane_sessions FROM anon;
