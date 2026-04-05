declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

declare module "https://esm.sh/@supabase/supabase-js@2.49.1" {
  type QueryResult = { data: unknown; error: unknown };
  type FilterableQuery = {
    select: (columns?: string) => FilterableQuery;
    eq: (column: string, value: string) => FilterableQuery;
    maybeSingle: () => Promise<QueryResult>;
    single: () => Promise<QueryResult>;
    insert: (values: unknown) => FilterableQuery;
    update: (values: unknown) => FilterableQuery;
    upsert: (values: unknown, options?: unknown) => Promise<QueryResult> | FilterableQuery;
  };
  type StorageBucket = {
    upload: (path: string, body: unknown, options?: unknown) => Promise<QueryResult>;
  };
  type Storage = {
    from: (bucket: string) => StorageBucket;
  };
  type SupabaseClientLike = {
    from: (table: string) => FilterableQuery;
    storage: Storage;
  };

  export const createClient: (...args: unknown[]) => SupabaseClientLike;
}

