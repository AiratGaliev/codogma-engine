# ai-chat

AI Chat backend for Codogma Engine — a minimal LLM chat-completions proxy on port `3031`.

## Security boundary

The service binds to `127.0.0.1:3031` by default, validates Host/Origin, limits JSON body/message sizes, uses a per-client token bucket and times out upstream LLM requests. `AI_CHAT_HOST` can override the bind address. No general user authentication is implemented: keep it local and do not bind it to `0.0.0.0` or expose it through an untrusted proxy. Host/Origin checks are not authentication for non-browser clients. The main editor server's security smoke does not cover this separate service, so run service-specific tests before changing its network exposure.

To install dependencies:

```bash
npm install
```

To run:

```bash
npm run dev        # node --watch index.mjs (dev)  |  npm start for plain node index.mjs
```

## Security boundary

AI Chat is a local helper and binds only to `127.0.0.1`, `localhost`, or `::1`.
A non-loopback `AI_CHAT_HOST` is rejected at startup because the service does not
implement remote authentication. Keep port `3031` off LAN/public interfaces; use an
authenticated SSH tunnel for remote development. HTTP header/request timeouts, a body-size
limit, Host/Origin validation, message limits, and rate limiting are enforced.
