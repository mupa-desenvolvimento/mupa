ALTER TABLE public.dispositivos
ADD COLUMN IF NOT EXISTS device_key text;

CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_device_key_key
ON public.dispositivos (device_key)
WHERE device_key IS NOT NULL AND device_key <> '';

