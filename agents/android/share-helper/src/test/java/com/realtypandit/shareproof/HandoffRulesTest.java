package com.realtypandit.shareproof;

import org.junit.Test;
import java.security.MessageDigest;
import static org.junit.Assert.*;

public class HandoffRulesTest {
    private final String token = "a".repeat(64);
    @Test public void acceptsOnlyExactHttpsLinkWithOpaqueCredential() {
        assertEquals(token, HandoffRules.launchToken(HandoffRules.LINK + "#token=" + token, null));
        assertEquals(token, HandoffRules.launchToken(HandoffRules.LINK, token));
        for (String invalid : new String[]{"http://admin.realtypandit.in/my-whatsapp/open.html", "https://evil.test/my-whatsapp/open.html",
            HandoffRules.LINK + "?token=" + token, "https://admin.realtypandit.in:443/my-whatsapp/open.html",
            "https://user@admin.realtypandit.in/my-whatsapp/open.html", HandoffRules.LINK + "#token=" + token + "&phone=123",
            "https://admin.realtypandit.in/my-whatsapp/open.html/", "https://admin.realtypandit.in/my-whatsapp/open%2ehtml"}) {
            assertThrows(IllegalArgumentException.class, () -> HandoffRules.launchToken(invalid, token));
        }
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.launchToken(HandoffRules.LINK, null));
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.launchToken(HandoffRules.LINK + "#token=" + token, "b".repeat(64)));
    }
    @Test public void limitsWholeJobAndValidatesOpaqueFiles() {
        assertEquals(10, HandoffRules.file("11111111-1111-4111-8111-111111111111", "photo.jpg", "image/jpeg", 10, token, 1, 0));
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.file("../file", "x", "image/jpeg", 1, token, 1, 0));
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.file("11111111-1111-4111-8111-111111111111", "x", "text/html", 1, token, 1, 0));
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.file("11111111-1111-4111-8111-111111111111", "x", "image/jpeg", 0, token, 1, 0));
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.file("11111111-1111-4111-8111-111111111111", "x", "image/jpeg", 1, token, 101, 0));
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.file("11111111-1111-4111-8111-111111111111", "x", "image/jpeg", 2, token, 2, ShareRules.MAX_BYTES - 1));
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.file("11111111-1111-4111-8111-111111111111", "x", "image/jpeg", Long.MAX_VALUE, token, 1, 0));
    }
    @Test public void expirationAndDigestsFailClosed() throws Exception {
        HandoffRules.expires(100 + ShareRules.TTL_MS, 100);
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.expires(100, 100));
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.expires(Long.MAX_VALUE, 100));
        MessageDigest digest = MessageDigest.getInstance("SHA-256"); digest.update(new byte[]{42});
        String expected = HandoffRules.hex(MessageDigest.getInstance("SHA-256").digest(new byte[]{42}));
        HandoffRules.digest(expected, digest);
        assertThrows(IllegalArgumentException.class, () -> HandoffRules.digest(token, MessageDigest.getInstance("SHA-256")));
    }
}
