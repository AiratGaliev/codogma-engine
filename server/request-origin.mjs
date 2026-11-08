/**
 * Loopback/origin request guard for the Codogma Engine local server.
 *
 * Lives in its own module so it can be unit-tested directly
 * (tests/request-origin.test.mjs) without booting the HTTP server, mirroring
 * the path-security.mjs layout.
 *
 * Threat model: the editor server binds to loopback on the user's machine and
 * must not be reachable by other hosts on the network, nor by a browser that
 * was tricked into talking to it under a different origin:
 *
 *   1. LAN exposure — the TCP peer must be loopback.
 *   2. DNS rebinding — an attacker page can rebind a domain it controls to
 *      127.0.0.1; the resulting requests carry the attacker's Host header, so
 *      the Host header must be loopback too.
 *   3. Cross-site browser requests — a browser always attaches an accurate
 *      Origin header to cross-origin requests; when present it must name the
 *      same host as the request itself (same-origin).
 *
 * Escape hatch for trusted reverse proxies: when the editor is published
 * through a local proxy (sandbox preview, tunnel, container port-mapping),
 * the proxy connects from loopback but forwards the public Host header. An
 * operator can explicitly allow additional hostnames via CODOGMA_ALLOWED_HOSTS
 * (comma-separated hostnames, or "*" to allow any Host header from loopback
 * peers). The default (unset) stays strictly loopback. The same-origin Origin
 * check keeps applying regardless, so cross-site browser attacks remain
 * blocked; only top-level navigations through the trusted proxy pass in.
 *
 * Some gateways rewrite the Host header to an internal name that the browser
 * never sees, so a browser Origin can never equal the request Host (the
 * sandbox preview platform works exactly like this: the page is served from
 * https://preview-chat-<id>.space-z.ai while the gateway forwards Host as an
 * internal *.fcapp.run name). For those deployments the operator can
 * additionally allow specific browser origins via CODOGMA_ALLOWED_ORIGINS
 * (comma-separated list; each entry is an exact origin like
 * "https://editor.example.com", a scheme-locked subdomain wildcard like
 * "https://*.space-z.ai", or "*" for everything). Entries must include the
 * scheme; a listed origin bypasses only the same-host comparison — the
 * loopback-peer and Host checks still apply. Because this weakens the
 * cross-site CSRF defense, keep the list as narrow as possible and prefer an
 * explicit wildcard domain over "*".
 */

/**
 * True when the TCP peer address is a loopback address (IPv4, IPv6 or
 * IPv4-mapped IPv6).
 */
export function isLoopbackAddress(address) {
    const value = String(address || "").toLowerCase()
    return value === "127.0.0.1" || value === "::1" || value.startsWith("::ffff:127.")
}

/**
 * Extract the normalized hostname (no port, no IPv6 brackets, no trailing
 * dots) from a Host/Origin authority string. Returns null when the value is
 * not a parseable host:port authority.
 */
function hostHeaderName(hostHeader) {
    if (typeof hostHeader !== "string" || hostHeader.length === 0) return null

    try {
        // URL.hostname keeps IPv6 brackets ("[::1]") and trailing dots
        // ("localhost."), so both are normalized before comparing.
        return new URL("http://" + hostHeader).hostname
            .toLowerCase()
            .replace(/^\[(.+)\]$/, "$1")
            .replace(/\.+$/, "") || null
    } catch {
        return null
    }
}

/**
 * True when the Host header names the loopback interface, with any port.
 */
export function isLoopbackHost(hostHeader) {
    const hostname = hostHeaderName(hostHeader)
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

/**
 * Parse the CODOGMA_ALLOWED_HOSTS value: comma-separated hostnames (case-
 * insensitive, ports are stripped by the matching logic) or a single "*".
 * Anything else is ignored rather than trusted.
 */
export function parseAllowedHosts(raw) {
    return String(raw ?? "")
        .split(",")
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
}

/**
 * True when a Host/Origin authority is acceptable: loopback always is;
 * otherwise it must be listed in `extraAllowedHosts` (or "*" allows all).
 * Entries are hostnames, so matching is port-insensitive.
 */
export function isAllowedHost(hostHeader, extraAllowedHosts = []) {
    if (isLoopbackHost(hostHeader)) return true
    if (!Array.isArray(extraAllowedHosts) || extraAllowedHosts.length === 0) return false
    if (extraAllowedHosts.includes("*")) return true

    const hostname = hostHeaderName(hostHeader)
    return hostname !== null && extraAllowedHosts.includes(hostname)
}

function originAuthority(value, { allowWildcardHost = false } = {}) {
    try {
        const parsed = new URL(String(value))
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
        const host = hostHeaderName(parsed.host)
        // A literal "*.domain" host is only meaningful in an allow-list entry;
        // no real browser can produce it as an Origin, so fail closed.
        if (!allowWildcardHost && host !== null && host.startsWith("*.")) return null
        return {
            scheme: parsed.protocol === "https:" ? "https" : "http",
            host,
            port: parsed.port
        }
    } catch {
        return null
    }
}

/**
 * Parse the CODOGMA_ALLOWED_ORIGINS value: comma-separated origin entries
 * (case-insensitive) or a single "*". Anything else is ignored rather than
 * trusted. Entries must carry a scheme ("https://*.space-z.ai"), otherwise
 * they can never match.
 */
export function parseAllowedOrigins(raw) {
    return String(raw ?? "")
        .split(",")
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
}

/**
 * True when the Origin header is explicitly trusted: an exact entry matches
 * scheme+host+port; a "scheme://*.domain" entry matches the domain itself and
 * any of its subdomains with the same scheme and port; "*" matches all.
 */
export function isAllowedOrigin(originHeader, extraAllowedOrigins = []) {
    if (!Array.isArray(extraAllowedOrigins) || extraAllowedOrigins.length === 0) return false
    if (extraAllowedOrigins.includes("*")) return true

    const origin = originAuthority(originHeader)
    if (origin === null) return false

    return extraAllowedOrigins.some(entry => {
        const allowed = originAuthority(entry, { allowWildcardHost: true })
        if (allowed === null || allowed.host === null) return false

        if (allowed.host.startsWith("*.")) {
            const domain = allowed.host.slice(2)
            return allowed.scheme === origin.scheme
                && allowed.port === origin.port
                && origin.host !== null
                && (origin.host === domain || origin.host.endsWith("." + domain))
        }

        return allowed.scheme === origin.scheme
            && allowed.host === origin.host
            && allowed.port === origin.port
    })
}

/**
 * Decide whether a request may pass the loopback/origin guard.
 *
 * Returns null when the request is allowed, otherwise a short machine-ish
 * reason string suitable for a log line explaining the 403. Keeping the
 * decision pure (no req/res) makes every branch testable.
 *
 * Origin handling: browsers attach an accurate Origin to cross-origin
 * requests, so a present Origin must name exactly the same authority as the
 * Host header. The scheme may legitimately be https when the editor is
 * published through an https reverse proxy, so only the host is compared —
 * never the scheme.
 */
export function evaluateRequestGuard({ peerAddress, hostHeader, originHeader, extraAllowedHosts = [], extraAllowedOrigins = [] }) {
    if (!isLoopbackAddress(peerAddress)) return "peer is not loopback"
    if (!isAllowedHost(hostHeader, extraAllowedHosts)) return "Host header is not allowed"

    // CLI/MCP requests generally omit Origin; browser requests must be
    // same-origin with the request's own Host — unless the origin is
    // explicitly allow-listed for a gateway that rewrites the Host header
    // (see the module docstring).
    if (originHeader !== undefined) {
        if (isAllowedOrigin(originHeader, extraAllowedOrigins)) {
            // Trusted origin behind the proxy: the Host header names an
            // internal gateway host, so same-host can never hold.
        } else {
            try {
                const origin = new URL(originHeader)
                const sameHost = typeof hostHeader === "string"
                    && origin.host.toLowerCase() === hostHeader.toLowerCase()
                if (!sameHost) return "Origin does not match Host (cross-origin)"
                if (!isAllowedHost(origin.host, extraAllowedHosts)) return "Origin host is not allowed"
            } catch {
                return "malformed Origin header"
            }
        }
    }

    return null
}
