declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

declare module "https://esm.sh/@supabase/supabase-js@2.49.1" {
  type QueryResult<T = any> = { data: T; error: any };
  type FilterableQuery<T = any> = {
    select: (columns?: string) => FilterableQuery<T>;
    eq: (column: string, value: any) => FilterableQuery<T>;
    neq: (column: string, value: any) => FilterableQuery<T>;
    gt: (column: string, value: any) => FilterableQuery<T>;
    gte: (column: string, value: any) => FilterableQuery<T>;
    lt: (column: string, value: any) => FilterableQuery<T>;
    lte: (column: string, value: any) => FilterableQuery<T>;
    like: (column: string, value: string) => FilterableQuery<T>;
    ilike: (column: string, value: string) => FilterableQuery<T>;
    in: (column: string, values: any[]) => FilterableQuery<T>;
    is: (column: string, value: any) => FilterableQuery<T>;
    or: (filters: string) => FilterableQuery<T>;
    order: (column: string, options?: any) => FilterableQuery<T>;
    limit: (count: number) => FilterableQuery<T>;
    range: (from: number, to: number) => FilterableQuery<T>;
    maybeSingle: () => Promise<QueryResult<T | null>>;
    single: () => Promise<QueryResult<T>>;
    insert: (values: any) => FilterableQuery<T>;
    update: (values: any) => FilterableQuery<T>;
    upsert: (values: any, options?: any) => Promise<QueryResult<T>> & FilterableQuery<T>;
    delete: () => FilterableQuery<T>;
    then: (onfulfilled?: (value: QueryResult<T[]>) => any) => Promise<any>;
  };
  type StorageBucket = {
    upload: (path: string, body: any, options?: any) => Promise<QueryResult>;
    download: (path: string) => Promise<QueryResult>;
    getPublicUrl: (path: string) => { data: { publicUrl: string } };
    remove: (paths: string[]) => Promise<QueryResult>;
    list: (path?: string, options?: any) => Promise<QueryResult>;
  };
  type Storage = {
    from: (bucket: string) => StorageBucket;
    createBucket: (name: string, options?: any) => Promise<QueryResult>;
    getBucket: (name: string) => Promise<QueryResult>;
    listBuckets: () => Promise<QueryResult>;
  };
  type SupabaseClientLike = {
    from: (table: string) => FilterableQuery<any>;
    storage: Storage;
    rpc: (fn: string, params?: any) => Promise<QueryResult>;
  };

  export const createClient: (...args: any[]) => SupabaseClientLike;
}
