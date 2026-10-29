/**
 * Unit tests for server/request-origin.mjs (node:test, no server required).
 *
 * Covers the loopback/origin guard decisions: peer address checks, Host
 * header normalization, the CODOGMA_ALLOWED_HOSTS escape hatch for trusted
 * reverse proxies, the CODOGMA_ALLOWED_ORIGINS escape hatch for gateways
 * that rewrite the Host header, and the same-origin Origin enforcement
 * (including the https-behind-proxy preview scenario).
 */

import test from "node:test"
import assert from "node:assert/strict"

import {
    isLoopbackAddress,
    isLoopbackHost,
    parseAllowedHosts,
    isAllowedHost,
    parseAllowedOrigins,
    isAllowedOrigin,
    evaluateRequestGuard
} from "../server/request-origin.mjs"

test("isLoopbackAddress accepts IPv4/IPv6 loopback and IPv4-mapped forms", () => {
    assert.equal(isLoopbackAddress("127.0.0.1"), true)
    assert.equal(isLoopbackAddress("::1"), true)
    assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true)
    assert.equal(isLoopbackAddress("::ffff:127.255.0.9"), true)

    assert.equal(isLoopbackAddress("192.168.1.5"), false, "LAN addresses must not pass")
    assert.equal(isLoopbackAddress("127.0.0.2"), false, "only 127.0.0.1 is the local peer")
    assert.equal(isLoopbackAddress("::2"), false)
    assert.equal(isLoopbackAddress("fe80::1"), false)
    assert.equal(isLoopbackAddress(""), false)
    assert.equal(isLoopbackAddress(null), false)
    assert.equal(isLoopbackAddress(undefined), false)
})

test("isLoopbackHost accepts the loopback hostname with any port", () => {
    assert.equal(isLoopbackHost("localhost"), true)
    assert.equal(isLoopbackHost("localhost:3000"), true)
    assert.equal(isLoopbackHost("127.0.0.1"), true)
    assert.equal(isLoopbackHost("127.0.0.1:3000"), true)
    assert.equal(isLoopbackHost("[::1]"), true)
    assert.equal(isLoopbackHost("[::1]:8080"), true)
    assert.equal(isLoopbackHost("LOCALHOST:3000"), true, "Host headers are case-insensitive")
    assert.equal(isLoopbackHost("localhost."), true, "browsers may send a trailing dot")
})

test("isLoopbackHost rejects other hosts and malformed values", () => {
    assert.equal(isLoopbackHost("attacker.example"), false)
    assert.equal(isLoopbackHost("localhost.attacker.example"), false, "subdomains must not match")
    assert.equal(isLoopbackHost("127.0.0.2"), false)
    assert.equal(isLoopbackHost("127.0.0.1.evil.example"), false)
    assert.equal(isLoopbackHost(""), false)
    assert.equal(isLoopbackHost(null), false)
    assert.equal(isLoopbackHost(undefined), false)
    assert.equal(isLoopbackHost("not a host header"), false)
})

test("parseAllowedHosts normalizes the env value", () => {
    assert.deepEqual(parseAllowedHosts(undefined), [])
    assert.deepEqual(parseAllowedHosts(""), [])
    assert.deepEqual(parseAllowedHosts("   "), [])
    assert.deepEqual(parseAllowedHosts("Preview.Example"), ["preview.example"])
    assert.deepEqual(parseAllowedHosts("a.example, b.example,,c.example"), ["a.example", "b.example", "c.example"])
    assert.deepEqual(parseAllowedHosts("*"), ["*"])
})

test("isAllowedHost is strictly loopback without an allow-list", () => {
    assert.equal(isAllowedHost("localhost:3000", []), true)
    assert.equal(isAllowedHost("127.0.0.1:3000", []), true)
    assert.equal(isAllowedHost("preview.example", []), false)
    assert.equal(isAllowedHost("preview.example"), false, "missing list behaves like empty")
})

test("isAllowedHost honors listed hostnames, port-insensitively", () => {
    const hosts = ["preview.example", "alt.example"]

    assert.equal(isAllowedHost("preview.example", hosts), true)
    assert.equal(isAllowedHost("PREVIEW.EXAMPLE", hosts), true, "matching is case-insensitive")
    assert.equal(isAllowedHost("preview.example:8443", hosts), true, "Host ports are stripped before matching")
    assert.equal(isAllowedHost("preview.example.", hosts), true, "trailing dot is normalized")

    assert.equal(isAllowedHost("other.example", hosts), false)
    assert.equal(isAllowedHost("sub.preview.example", hosts), false, "no implicit subdomain wildcards")
    assert.equal(isAllowedHost("attacker.example", hosts), false)
})

test("isAllowedHost supports the explicit wildcard", () => {
    const hosts = ["*"]
    assert.equal(isAllowedHost("anything.example", hosts), true)
    assert.equal(isAllowedHost("attacker.example:80", hosts), true)
    assert.equal(isAllowedHost("preview.example", ["*", "unused.example"]), true)
})

test("evaluateRequestGuard keeps the strict default loopback behavior", () => {
    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "localhost:3000",
        originHeader: undefined,
        extraAllowedHosts: []
    }), null, "plain loopback request without Origin passes")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "localhost:3000",
        originHeader: "http://localhost:3000",
        extraAllowedHosts: []
    }), null, "same-origin loopback request passes")

    assert.equal(evaluateRequestGuard({
        peerAddress: "192.168.1.7",
        hostHeader: "localhost:3000",
        originHeader: undefined,
        extraAllowedHosts: []
    }), "peer is not loopback", "LAN peers are rejected even with a good Host")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "attacker.example",
        originHeader: undefined,
        extraAllowedHosts: []
    }), "Host header is not allowed", "DNS-rebound Host is rejected")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "localhost:3000",
        originHeader: "http://attacker.example",
        extraAllowedHosts: []
    }), "Origin does not match Host (cross-origin)", "cross-site browser requests are rejected")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "localhost:3000",
        originHeader: "not a url",
        extraAllowedHosts: []
    }), "malformed Origin header", "unparseable Origin fails closed")
})

test("evaluateRequestGuard admits a trusted proxy's public Host via the allow-list", () => {
    const hosts = ["preview.example"]

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "preview.example",
        originHeader: undefined,
        extraAllowedHosts: hosts
    }), null, "top-level navigation through the proxy passes")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "preview.example",
        originHeader: "https://preview.example",
        extraAllowedHosts: hosts
    }), null, "https same-origin behind an https proxy passes")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "preview.example",
        originHeader: "https://attacker.example",
        extraAllowedHosts: hosts
    }), "Origin does not match Host (cross-origin)", "the proxy does not disable Origin enforcement")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "preview.example",
        originHeader: "http://alt.example",
        extraAllowedHosts: hosts
    }), "Origin does not match Host (cross-origin)", "an allow-listed but different origin is still cross-origin")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "evil.example",
        originHeader: "http://evil.example",
        extraAllowedHosts: hosts
    }), "Host header is not allowed", "allow-list does not open unlisted hosts, even same-origin")

    assert.equal(evaluateRequestGuard({
        peerAddress: "192.168.1.7",
        hostHeader: "preview.example",
        originHeader: undefined,
        extraAllowedHosts: hosts
    }), "peer is not loopback", "the allow-list does not open non-loopback peers")
})

test("parseAllowedOrigins normalizes the env value", () => {
    assert.deepEqual(parseAllowedOrigins(undefined), [])
    assert.deepEqual(parseAllowedOrigins(""), [])
    assert.deepEqual(parseAllowedOrigins("   "), [])
    assert.deepEqual(parseAllowedOrigins("HTTPS://Preview.Example"), ["https://preview.example"])
    assert.deepEqual(parseAllowedOrigins("https://a.example, https://b.example,,*"),
        ["https://a.example", "https://b.example", "*"])
    assert.deepEqual(parseAllowedOrigins("*"), ["*"])
})

test("isAllowedOrigin matches exact origins and scheme-locked subdomain wildcards", () => {
    const exact = ["https://editor.example.com"]
    assert.equal(isAllowedOrigin("https://editor.example.com", exact), true)
    assert.equal(isAllowedOrigin("HTTPS://Editor.Example.Com", exact), true, "matching is case-insensitive")
    assert.equal(isAllowedOrigin("https://editor.example.com/", exact), true, "a trailing slash is not part of the origin")
    assert.equal(isAllowedOrigin("http://editor.example.com", exact), false, "the scheme cannot be downgraded")
    assert.equal(isAllowedOrigin("https://other.example.com", exact), false)
    assert.equal(isAllowedOrigin("https://sub.editor.example.com", exact), false, "exact entries are not wildcards")
    assert.equal(isAllowedOrigin("not a url", exact), false, "malformed origins fail closed")

    const wildcard = ["https://*.space-z.ai"]
    assert.equal(isAllowedOrigin("https://preview-chat-2cebdf49.space-z.ai", wildcard), true)
    assert.equal(isAllowedOrigin("https://space-z.ai", wildcard), true, "the domain itself matches")
    assert.equal(isAllowedOrigin("http://preview-chat-2cebdf49.space-z.ai", wildcard), false, "scheme-locked")
    assert.equal(isAllowedOrigin("https://evil-space-z.ai", wildcard), false, "suffix without a dot boundary")
    assert.equal(isAllowedOrigin("https://space-z.ai.attacker.example", wildcard), false)

    const ported = ["https://editor.example.com:8443"]
    assert.equal(isAllowedOrigin("https://editor.example.com:8443", ported), true)
    assert.equal(isAllowedOrigin("https://editor.example.com", ported), false, "a default-port origin is a different origin")

    assert.equal(isAllowedOrigin("https://anything.example", ["*"]), true, "the full wildcard allows everything")
    assert.equal(isAllowedOrigin("https://preview.example"), false, "missing list behaves like empty")
    assert.equal(isAllowedOrigin("https://preview.example", []), false)
    assert.equal(isAllowedOrigin("https://*.space-z.ai", wildcard), false, "a literal wildcard origin is not a real browser origin")
})

test("evaluateRequestGuard admits explicitly allow-listed origins behind a Host-rewriting gateway", () => {
    // The sandbox preview scenario, with the values that actually occur:
    // the page is served from https://preview-chat-<id>.space-z.ai while the
    // gateway forwards Host as an internal *.fcapp.run name.
    const hosts = ["*"]
    const origins = ["https://*.space-z.ai"]
    const gatewayHost = "ws-ba-eb-bedaeb-ghpmjdlxaz.cn-hongkong-vpc.fcapp.run"
    const previewOrigin = "https://preview-chat-2cebdf49-7db0-4dd9-ab76-a6bada7b6f74.space-z.ai"

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: gatewayHost,
        originHeader: previewOrigin,
        extraAllowedHosts: hosts,
        extraAllowedOrigins: origins
    }), null, "the platform preview origin passes even though Host is rewritten")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: gatewayHost,
        originHeader: "https://attacker.example",
        extraAllowedHosts: hosts,
        extraAllowedOrigins: origins
    }), "Origin does not match Host (cross-origin)", "unrelated origins stay rejected")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: gatewayHost,
        originHeader: previewOrigin,
        extraAllowedHosts: hosts,
        extraAllowedOrigins: []
    }), "Origin does not match Host (cross-origin)", "without an origin allow-list the behavior is unchanged")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: "localhost:3000",
        originHeader: "http://localhost:3000",
        extraAllowedHosts: [],
        extraAllowedOrigins: ["https://*.space-z.ai"]
    }), null, "same-origin requests keep passing when an origin list exists")

    assert.equal(evaluateRequestGuard({
        peerAddress: "192.168.1.7",
        hostHeader: gatewayHost,
        originHeader: previewOrigin,
        extraAllowedHosts: hosts,
        extraAllowedOrigins: origins
    }), "peer is not loopback", "the origin allow-list does not open non-loopback peers")

    assert.equal(evaluateRequestGuard({
        peerAddress: "127.0.0.1",
        hostHeader: gatewayHost,
        originHeader: previewOrigin,
        extraAllowedHosts: [],
        extraAllowedOrigins: origins
    }), "Host header is not allowed", "the origin allow-list does not open unlisted Host headers")
})
