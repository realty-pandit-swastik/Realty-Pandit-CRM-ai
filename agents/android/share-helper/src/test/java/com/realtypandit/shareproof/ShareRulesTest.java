package com.realtypandit.shareproof;

import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.List;
import static org.junit.Assert.*;

public class ShareRulesTest {
    @Test public void acceptsCanonicalRecipientWithoutContactsLookup() {
        assertEquals("12025550123@s.whatsapp.net", ShareRules.recipientJid("+12025550123"));
    }
    @Test public void rejectsPlaceholdersAndUnnormalizedNumbers() {
        for (String phone : List.of("TEMP_1234567890", "PENDING-1234567890-1", "1234567890", "+1", "+00000000", "+1 2025550123", "+1234567890123456")) {
            assertThrows(IllegalArgumentException.class, () -> ShareRules.recipientJid(phone));
        }
    }
    @Test public void supportsEachRequiredAttachmentShape() {
        assertEquals("image/jpeg", ShareRules.mimeType(List.of("image/jpeg")));
        assertEquals("image/jpeg", ShareRules.mimeType(List.of("image/jpeg", "image/jpeg")));
        assertEquals("image/*", ShareRules.mimeType(List.of("image/png", "image/jpeg")));
        assertEquals("video/mp4", ShareRules.mimeType(List.of("video/mp4")));
        assertEquals("video/*", ShareRules.mimeType(List.of("video/mp4", "video/quicktime")));
        assertEquals("*/*", ShareRules.mimeType(List.of("image/jpeg", "video/mp4")));
        assertEquals("application/pdf", ShareRules.mimeType(List.of("application/pdf")));
    }
    @Test public void requiresSeparatePdfStep() {
        assertThrows(IllegalArgumentException.class, () -> ShareRules.mimeType(List.of("application/pdf", "image/jpeg")));
        assertThrows(IllegalArgumentException.class, () -> ShareRules.mimeType(List.of("application/pdf", "application/pdf")));
    }
    @Test public void enforcesFileCountAndTypes() {
        assertEquals("image/jpeg", ShareRules.mimeType(Collections.nCopies(100, "image/jpeg")));
        assertThrows(IllegalArgumentException.class, () -> ShareRules.mimeType(Collections.nCopies(101, "image/jpeg")));
        assertThrows(IllegalArgumentException.class, () -> ShareRules.mimeType(List.of()));
        assertThrows(IllegalArgumentException.class, () -> ShareRules.mimeType(List.of("text/html")));
        assertThrows(IllegalArgumentException.class, () -> ShareRules.mimeType(Collections.singletonList(null)));
    }
    @Test public void copiesSelectedBytesAndHonorsRemainingBudget() throws Exception {
        byte[] bytes = {1, 2, 3};
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertEquals(3, ShareRules.copy(new ByteArrayInputStream(bytes), output, 3));
        assertArrayEquals(bytes, output.toByteArray());
        assertThrows(IOException.class, () -> ShareRules.copy(new ByteArrayInputStream(bytes), new ByteArrayOutputStream(), 2));
        assertThrows(IOException.class, () -> ShareRules.copy(new ByteArrayInputStream(new byte[0]), new ByteArrayOutputStream(), 5));
    }
    @Test public void reportsReadFailureWithoutSuccessfulPreparation() {
        java.io.InputStream failure = new java.io.InputStream() {
            @Override public int read() throws IOException { throw new IOException("test read failure"); }
        };
        assertThrows(IOException.class, () -> ShareRules.copy(failure, new ByteArrayOutputStream(), 10));
    }
    @Test public void cancellationInterruptsCopy() {
        Thread.currentThread().interrupt();
        try {
            assertThrows(IOException.class, () -> ShareRules.copy(new ByteArrayInputStream(new byte[]{1}), new ByteArrayOutputStream(), 1));
        } finally { Thread.interrupted(); }
    }
    @Test public void expiryIsFailClosedAtTheBoundary() {
        assertFalse(ShareRules.expired("1000_id", 999));
        assertTrue(ShareRules.expired("1000_id", 1000));
        assertTrue(ShareRules.expired("1000_id", 1001));
        assertTrue(ShareRules.expired("invalid", 999));
    }
}
