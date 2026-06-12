CREATE POLICY "Authenticated can insert produtos" ON public.produtos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update produtos" ON public.produtos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
GRANT INSERT, UPDATE ON public.produtos TO authenticated;