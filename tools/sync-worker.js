// GymTracker custom-sync Worker (feat 125) — a tiny personal sync endpoint for Cloudflare Workers.
// It stores ONE JSON blob and serves it back, gated by a bearer token. Free to deploy on workers.dev.
//
// This is the backend for GymTracker's "Custom endpoint" sync option: no third-party login, works on
// every device (incl. Apple), and your data never touches anyone else's servers. The app GETs the blob
// and PUTs it back; the GymTracker merge engine handles reconciliation, so the server stays dumb.
//
// ── Setup ────────────────────────────────────────────────────────────────────────────────────────
//   1) Create a Worker (Cloudflare dashboard → Workers & Pages → Create → Worker) and paste this code,
//      OR `npm create cloudflare@latest gymtracker-sync` and drop this in `src/index.js`.
//   2) Create a KV namespace and bind it to the Worker as `GT`
//      (Worker → Settings → Variables and Secrets → KV Namespace Bindings → Variable name: GT).
//   3) Add a secret `TOKEN` = a long random string (Worker → Settings → Variables and Secrets → Add → Encrypt).
//   4) Deploy. In GymTracker → Settings → Data Management → Cloud Sync → Custom endpoint, paste the
//      Worker URL (e.g. https://gymtracker-sync.<you>.workers.dev) and the same TOKEN, then Connect.
//
// ── Security ─────────────────────────────────────────────────────────────────────────────────────
//   Single-user store: anyone with the URL + TOKEN can read/write your log. Keep TOKEN secret, and
//   consider narrowing Access-Control-Allow-Origin below from '*' to your app's origin.

const CORS = {
  'Access-Control-Allow-Origin': '*', // e.g. 'https://adervec.github.io' to lock it to your PWA
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // Bearer-token gate (the token GymTracker sends as `Authorization: Bearer <TOKEN>`).
    const auth = request.headers.get('Authorization') || '';
    if (!env.TOKEN || auth !== 'Bearer ' + env.TOKEN) {
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }

    if (request.method === 'GET') {
      const data = await env.GT.get('state');
      if (data == null) return new Response('', { status: 404, headers: CORS }); // 404 -> app treats as "empty"
      return new Response(data, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (request.method === 'PUT') {
      await env.GT.put('state', await request.text());
      return new Response('{"ok":true}', { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  },
};
