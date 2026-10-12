package com.realtypandit.shareproof;

import java.net.URI;
import java.security.MessageDigest;
import java.util.Locale;

final class HandoffRules {
    static final String LINK = "https://admin.realtypandit.in/my-whatsapp/open.html";
    static final String API = "https://api.realtypandit.in/api/personal-whatsapp/handoffs";

    static String launchToken(String data, String extra) {
        URI uri;
        try { uri = URI.create(data == null ? "" : data); }
        catch (IllegalArgumentException e) { throw new IllegalArgumentException("Invalid CRM launch link."); }
        if (!"https".equals(uri.getScheme()) || !"admin.realtypandit.in".equals(uri.getHost())
            || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getRawQuery() != null
            || !"/my-whatsapp/open.html".equals(uri.getRawPath())) {
            throw new IllegalArgumentException("Open a new handoff from the CRM.");
        }
        String fragment = uri.getRawFragment();
        String token = fragment == null ? extra : (fragment.startsWith("token=") ? fragment.substring(6) : null);
        if (extra != null && fragment != null && !extra.equals(token)) throw new IllegalArgumentException("Conflicting launch credentials.");
        credential(token);
        return token;
    }

    static void credential(String value) {
        if (value == null || !value.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Invalid or expired CRM handoff. Prepare it again in CRM.");
    }
    static void expires(long expiry, long now) {
        if (expiry <= now || expiry - now > ShareRules.TTL_MS + 60_000) throw new IllegalArgumentException("The handoff has expired. Prepare it again in CRM.");
    }
    static long file(String id, String name, String mime, long bytes, String digest, int count, long total) {
        if (id == null || !id.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}") || name == null || name.isEmpty() || name.length() > 255
            || bytes <= 0 || bytes > ShareRules.MAX_BYTES || digest == null || !digest.matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("Invalid attachment manifest.");
        }
        ShareRules.mimeType(java.util.Collections.singletonList(mime));
        if (count > ShareRules.MAX_FILES || bytes > ShareRules.MAX_BYTES - total) throw new IllegalArgumentException("The whole handoff exceeds 100 files or 40 MiB.");
        return total + bytes;
    }
    static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }
    static void digest(String expected, MessageDigest digest) {
        if (!expected.equals(hex(digest.digest()))) throw new IllegalArgumentException("An attachment failed its integrity check. Prepare again in CRM.");
    }
    private HandoffRules() {}
}
