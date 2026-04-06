declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

declare module "https://esm.sh/@supabase/supabase-js@2.49.1" {
  type QueryResult<T = unknown> = { data: T; error: unknown };
  type FilterableQuery<T = unknown> = {
    select: (columns?: string) => FilterableQuery<T>;
    eq: (column: string, value: unknown) => FilterableQuery<T>;
    neq: (column: string, value: unknown) => FilterableQuery<T>;
    gt: (column: string, value: unknown) => FilterableQuery<T>;
    gte: (column: string, value: unknown) => FilterableQuery<T>;
    lt: (column: string, value: unknown) => FilterableQuery<T>;
    lte: (column: string, value: unknown) => FilterableQuery<T>;
    like: (column: string, value: string) => FilterableQuery<T>;
    ilike: (column: string, value: string) => FilterableQuery<T>;
    in: (column: string, values: unknown[]) => FilterableQuery<T>;
    is: (column: string, value: unknown) => FilterableQuery<T>;
    or: (filters: string) => FilterableQuery<T>;
    order: (column: string, options?: unknown) => FilterableQuery<T>;
    limit: (count: number) => FilterableQuery<T>;
    range: (from: number, to: number) => FilterableQuery<T>;
    maybeSingle: () => Promise<QueryResult<T | null>>;
    single: () => Promise<QueryResult<T>>;
    insert: (values: unknown) => FilterableQuery<T>;
    update: (values: unknown) => FilterableQuery<T>;
    upsert: (values: unknown, options?: unknown) => Promise<QueryResult<T>> & FilterableQuery<T>;
    delete: () => FilterableQuery<T>;
    then: (onfulfilled?: (value: QueryResult<T[]>) => unknown) => Promise<unknown>;
  };
  type StorageBucket = {
    upload: (path: string, body: unknown, options?: unknown) => Promise<QueryResult>;
    download: (path: string) => Promise<QueryResult>;
    getPublicUrl: (path: string) => { data: { publicUrl: string } };
    remove: (paths: string[]) => Promise<QueryResult>;
    list: (path?: string, options?: unknown) => Promise<QueryResult>;
  };
  type Storage = {
    from: (bucket: string) => StorageBucket;
    createBucket: (name: string, options?: unknown) => Promise<QueryResult>;
    getBucket: (name: string) => Promise<QueryResult>;
    listBuckets: () => Promise<QueryResult>;
  };
  type SupabaseClientLike = {
    from: (table: string) => FilterableQuery<unknown>;
    storage: Storage;
    rpc: (fn: string, params?: unknown) => Promise<QueryResult>;
  };

  export const createClient: (...args: unknown[]) => SupabaseClientLike;
}
