# Headless DNS widget v2 starter for React

Build a DNS setup flow in your own React interface using the [Approximated headless DNS API](https://approximated.app/docs/#dns-widget-headless).

This is a **headless** integration. React renders the interface; Approximated supplies provider-specific instructions and DNS verification results as JSON. It does not embed the ready-made widget or an iframe.

The starter includes provider instructions, copyable record values, automatic setup when supported by the DNS provider, verification results, retries, and a local server endpoint that creates short-lived widget tokens. Three selectable designs show different ways to present the same DNS setup flow.

## Availability

This starter targets the DNS widget v2 API. The hosted `headless.v2.js` client and `/api/dns/v2` endpoints must be deployed before live DNS setup works. You can install the starter, run its interface, build it, and run its tests in the meantime. The tests use stubs and do not need an API key or live DNS.

## Hosted demo

[Try the React demo](https://cloud.approximated.app/dnswidget/demo/headless/react) to explore this interface without installing the starter or supplying an API key. It uses an example CNAME target and Approximated’s public demo token endpoint. The hosted demo becomes available with the headless API release described above.

## Run locally

Requirements: Node.js 22.12 or newer, npm, and an Approximated cluster API key for live requests. CI uses the Node version in `.node-version`.

Use GitHub's **Use this template** button, or clone the repository:

```sh
git clone https://github.com/Approximated-Inc/headless-dns-widget-react-starter.git
cd headless-dns-widget-react-starter
npm ci
cp .env.example .env
```

Edit `.env`:

- Set `APX_API_KEY` to your cluster API key. It is read only by the Node server. Never give it a `VITE_` prefix or put it in frontend code.
- Set `VITE_CNAME_TARGET` to the hostname your application asks customers to point to. `domains.example.com` is an example, not a working target.

Start the app:

```sh
npm run dev
```

Open **http://127.0.0.1:5173** exactly as printed by the server. The local server accepts only this loopback address; `localhost` and other hostnames are rejected. Enter a domain and click **Get setup instructions**. You do not need to change DNS to inspect instructions. Verification succeeds only when the expected records are published.

The browser loads `https://cloud.approximated.app/dnswidget/headless.v2.js` and sends its scoped token to the `/api/dns/v2/token` instructions and verification routes. Your Node server keeps the API key private and calls `GET https://cloud.approximated.app/api/dns/v2/token` to obtain a short-lived token. The local `POST /api/dns-widget-token` route returns only that token to the browser. The session uses `https://cloud.approximated.app/api/dns/v2` as its browser API URL.

## Design variations

Use the **Simple**, **Dashboard**, and **Guided** tabs to explore the layouts:

- **Simple** keeps the domain form, provider instructions, and verification in calm, stacked cards.
- **Dashboard** puts the domain controls beside a wider record workspace, with copyable fields in a compact grid and provider instructions available per record. It becomes a single column on smaller screens.
- **Guided** presents numbered sections for the domain, provider changes, and verification, with more space and a teal accent. Steps only show DNS completion after a successful verification response.

Switching designs preserves the entered domain, active requests, provider instructions, errors, and verification results. The tabs support Left/Right Arrow, Home, and End keys. All three designs use the same session controller and real API responses.

## Adapt the starter

- `src/`: the React interface and entry point.
- `shared/session.js`: records to request, session state, token expiry, cancellation, and protection against stale responses.
- `shared/browser.js`: the public CNAME target and headless client adapter.
- `shared/styles.css`: shared styles for all three designs, including the default Approximated carnation palette.
- `shared/design.js`: keyboard navigation and guided-step presentation derived from the session state.
- `token-server.mjs`: `POST /api/dns-widget-token`, which returns only the token and disables response caching.
- `server.mjs`: the local Vite and token server.
- `test/`: token endpoint, session lifecycle, keyboard navigation, guided steps, and rendered automatic/manual setup regression tests.

Edit the `records` array in `shared/session.js` to request the A, CNAME, or TXT records your app needs. The default requests one CNAME for the domain the customer enters. In this API, `@` means the **full supplied domain**, including any subdomain. For `shop.customer.com`, Cloudflare's display name is `shop`.

Render each returned field step's `label` and `value`: provider display values can differ from the request. An empty field value means leave that field blank. TTL values may be labels such as `Auto` or `1 Hour`.

The interface renders text, links, and fields without inserting raw HTML. When a record has a supported Domain Connect link, its provider group shows **Set up DNS automatically** with a prominent provider setup button. Customers review and approve each record at the provider, then return to verify. Each automatic button applies only to its identified record; any records that still need manual setup are listed. Manual instructions and copyable fields for automatic records stay under **Set up manually instead** in every design. Records without automatic setup keep their manual setup visible. Verification shows the record address, expected value, actual values, and match state. Customers can retry partial or failed checks.

## Integrate with your application

Move the React components and shared modules into your frontend, include `headless.v2.js`, and implement the token route in your backend. Keep the browser API URL on `/api/dns/v2`. In a server-rendered framework, initialize the browser client inside a client-side component.

Before minting a token, authenticate the customer, check their permission to configure the domain, and apply your normal request limits and CSRF protection. Keep the API key in your server's secret store and preserve `Cache-Control: no-store` on the token response.

The included server is a local development example and refuses to run with `NODE_ENV=production`. Its Host/Origin checks do not replace your app's authentication. Do not deploy it as your production backend.

DNS verification confirms which records DNS currently returns. It does not prove tenant ownership, create a virtual host, or confirm routing and HTTPS. Complete those checks in your backend before marking a domain ready.

## Build and test

```sh
npm test
npm run build
```

The build writes frontend assets to `dist/`. A deployed integration also needs the authenticated server token endpoint described above. CI runs the tests and build on every pull request and push to `main`.

## Related

- [Headless DNS widget documentation](https://approximated.app/docs/#dns-widget-headless)
- [Headless DNS widget Vue starter](https://github.com/Approximated-Inc/headless-dns-widget-vue-starter)

The session controller, local token endpoint, and their tests are shared with the sibling starter. When fixing these common files, apply the equivalent change to both repositories.
