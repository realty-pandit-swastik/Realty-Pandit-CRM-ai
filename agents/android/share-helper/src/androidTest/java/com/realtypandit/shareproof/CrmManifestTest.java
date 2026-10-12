package com.realtypandit.shareproof;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class CrmManifestTest {
    private JSONObject file(String id, String mime) throws Exception {
        return new JSONObject().put("id", id).put("name", "Synthetic file").put("mime", mime).put("size", 10).put("sha256", "a".repeat(64));
    }
    private JSONObject step(String property, String kind, String text, JSONObject... files) throws Exception {
        return new JSONObject().put("property_id", property).put("label", "Synthetic property").put("kind", kind).put("text", text).put("files", new JSONArray(files));
    }
    private JSONObject manifest(JSONObject... steps) throws Exception {
        return new JSONObject().put("version", 1).put("recipient", "+12025550123").put("sending_app", "com.whatsapp")
            .put("expires_at", System.currentTimeMillis() + ShareRules.TTL_MS).put("steps", new JSONArray(steps));
    }
    @Test public void mixedMediaAndPdfPreserveSequence() throws Exception {
        HandoffManifest result = new HandoffManifest(manifest(step("p1", "media", "Details", file("44444444-4444-4444-8444-444444444444", "image/jpeg"), file("22222222-2222-4222-8222-222222222222", "video/mp4")),
            step("p1", "pdf", "", file("33333333-3333-4333-8333-333333333333", "application/pdf")), step("p2", "media", "Other details", file("55555555-5555-4555-8555-555555555555", "video/mp4"))), System.currentTimeMillis());
        assertEquals(3, result.steps.size()); assertEquals("44444444-4444-4444-8444-444444444444", result.steps.get(0).files.get(0).id);
        assertEquals("*/*", result.steps.get(0).mime); assertEquals("pdf", result.steps.get(1).kind);
    }
    @Test public void rejectsInvalidManifestBeforeAnyPreview() throws Exception {
        JSONObject media = step("p1", "media", "Details", file("66666666-6666-4666-8666-666666666666", "image/jpeg"));
        assertThrows(IllegalArgumentException.class, () -> new HandoffManifest(manifest(media, media), System.currentTimeMillis()));
        assertThrows(IllegalArgumentException.class, () -> new HandoffManifest(manifest(step("p1", "media", "", file("33333333-3333-4333-8333-333333333333", "application/pdf"))), System.currentTimeMillis()));
        assertThrows(IllegalArgumentException.class, () -> new HandoffManifest(manifest(step("p1", "pdf", "caption", file("33333333-3333-4333-8333-333333333333", "application/pdf"))), System.currentTimeMillis()));
        assertThrows(IllegalArgumentException.class, () -> new HandoffManifest(manifest(step("p1", "pdf", "", file("33333333-3333-4333-8333-333333333333", "application/pdf")), media), System.currentTimeMillis()));
        assertThrows(IllegalArgumentException.class, () -> new HandoffManifest(manifest().put("sending_app", "evil.app"), System.currentTimeMillis()));
        assertThrows(IllegalArgumentException.class, () -> new HandoffManifest(manifest(media).put("expires_at", 1), System.currentTimeMillis()));
    }
    @Test public void pdfOnlyAndVideoOnlyAreValid() throws Exception {
        assertEquals("application/pdf", new HandoffManifest(manifest(step("p1", "pdf", "", file("33333333-3333-4333-8333-333333333333", "application/pdf"))), System.currentTimeMillis()).steps.get(0).mime);
        assertEquals("video/mp4", new HandoffManifest(manifest(step("p1", "media", "Details", file("22222222-2222-4222-8222-222222222222", "video/mp4"))), System.currentTimeMillis()).steps.get(0).mime);
    }
}
