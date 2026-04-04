INSERT INTO storage.buckets (id, name, public)
VALUES ('produto-nobg', 'produto-nobg', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read produto-nobg"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'produto-nobg');

CREATE POLICY "Service insert produto-nobg"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'produto-nobg');

CREATE POLICY "Service update produto-nobg"
  ON storage.objects
  FOR UPDATE
  TO service_role
  USING (bucket_id = 'produto-nobg');

