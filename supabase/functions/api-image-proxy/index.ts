const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function cleanUrl(raw: string) {
  return String(raw ?? "")
    .trim()
    .replace(/`/g, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "");
}

function isAllowedHost(hostname: string) {
  const h = hostname.toLowerCase();
  return (
    h === "magaluobjects.com" ||
    h.endsWith(".magaluobjects.com") ||
    h === "vteximg.com.br" ||
    h.endsWith(".vteximg.com.br") ||
    h === "vtexassets.com" ||
    h.endsWith(".vtexassets.com") ||
    h === "srv-mupa.ddns.net"
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const urlParam = new URL(req.url).searchParams.get("url") ?? "";
  const src = cleanUrl(urlParam);
  if (!src) return new Response("missing url", { status: 400, headers: corsHeaders });

  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return new Response("invalid url", { status: 400, headers: corsHeaders });
  }

  const allowHttp = u.hostname.toLowerCase() === "srv-mupa.ddns.net";
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) {
    return new Response("invalid protocol", { status: 400, headers: corsHeaders });
  }

  if (!isAllowedHost(u.hostname)) {
    return new Response("host not allowed", { status: 403, headers: corsHeaders });
  }

  const res = await fetch(u.toString(), {
    redirect: "follow",
    headers: {
      "Accept": "image/*",
    },
  }).catch(() => null);

  if (!res || !res.ok) {
    return new Response("fetch failed", { status: 502, headers: corsHeaders });
  }

  const ct = res.headers.get("Content-Type") || "application/octet-stream";
  const buf = await res.arrayBuffer();

  return new Response(buf, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": ct,
      "Cache-Control": "public, max-age=86400",
    },
  });
});
