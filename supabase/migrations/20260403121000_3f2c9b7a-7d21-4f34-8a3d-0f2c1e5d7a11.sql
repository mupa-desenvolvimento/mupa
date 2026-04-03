-- Código único por empresa para vincular/ativar dispositivos

create or replace function public.random_base32_code(len int default 8)
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  if len is null or len < 4 then
    len := 8;
  end if;

  for i in 1..len loop
    result := result || substr(chars, floor(random() * char_length(chars) + 1)::int, 1);
  end loop;

  return result;
end;
$$;

create or replace function public.generate_empresa_codigo()
returns text
language plpgsql
as $$
declare
  code text;
begin
  loop
    code := public.random_base32_code(8);
    exit when not exists (select 1 from public.empresas where codigo_vinculo = code);
  end loop;
  return code;
end;
$$;

alter table public.empresas
add column if not exists codigo_vinculo text;

update public.empresas
set codigo_vinculo = public.generate_empresa_codigo()
where codigo_vinculo is null;

alter table public.empresas
alter column codigo_vinculo set default public.generate_empresa_codigo();

alter table public.empresas
alter column codigo_vinculo set not null;

create unique index if not exists empresas_codigo_vinculo_key
on public.empresas (codigo_vinculo);

create or replace function public.generate_dispositivo_codigo()
returns text
language plpgsql
as $$
declare
  code text;
begin
  loop
    code := public.random_base32_code(8);
    exit when not exists (select 1 from public.dispositivos where codigo_ativacao = code);
  end loop;
  return code;
end;
$$;

alter table public.dispositivos
alter column codigo_ativacao set default public.generate_dispositivo_codigo();

