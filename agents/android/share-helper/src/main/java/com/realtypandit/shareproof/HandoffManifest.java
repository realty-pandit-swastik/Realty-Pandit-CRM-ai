package com.realtypandit.shareproof;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

final class HandoffManifest {
    final JSONObject json;
    final String recipient, app;
    final long expiry;
    final List<Step> steps = new ArrayList<>();
    static final class Attachment {
        final String id, name, mime, sha256;
        final long size;
        Attachment(JSONObject file) throws JSONException {
            id = file.getString("id"); name = file.getString("name"); mime = file.getString("mime");
            sha256 = file.getString("sha256"); size = file.getLong("size");
        }
    }
    static final class Step {
        final String property, label, text, kind, mime;
        final List<Attachment> files = new ArrayList<>();
        Step(JSONObject step) throws JSONException {
            property = step.getString("property_id"); label = step.getString("label");
            text = step.getString("text"); kind = step.getString("kind");
            if (property.isEmpty() || label.isEmpty() || label.length() > 1000 || text.length() > 20_000
                || !(kind.equals("media") || kind.equals("pdf"))) throw new IllegalArgumentException("Invalid property step.");
            JSONArray array = step.getJSONArray("files");
            List<String> types = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) {
                Attachment file = new Attachment(array.getJSONObject(i));
                files.add(file); types.add(file.mime);
                if (kind.equals("pdf") != file.mime.equals("application/pdf")) throw new IllegalArgumentException("PDF must be a separate step.");
            }
            mime = ShareRules.mimeType(types);
            if (kind.equals("pdf") && !text.isEmpty()) throw new IllegalArgumentException("PDF step cannot carry a media caption.");
        }
    }
    HandoffManifest(JSONObject json, long now) throws JSONException {
        this.json = json;
        if (json.getInt("version") != 1) throw new IllegalArgumentException("Update the My WhatsApp helper.");
        recipient = json.getString("recipient"); ShareRules.recipientJid(recipient);
        app = json.getString("sending_app");
        if (!app.equals("com.whatsapp") && !app.equals("com.whatsapp.w4b")) throw new IllegalArgumentException("Invalid sending app.");
        expiry = json.getLong("expires_at"); HandoffRules.expires(expiry, now);
        JSONArray array = json.getJSONArray("steps");
        if (array.length() == 0 || array.length() > ShareRules.MAX_FILES) throw new IllegalArgumentException("No valid property steps.");
        HashSet<String> ids = new HashSet<>();
        HashSet<String> completed = new HashSet<>();
        String last = null;
        boolean pdfSeen = false;
        int count = 0;
        long total = 0;
        for (int i = 0; i < array.length(); i++) {
            Step step = new Step(array.getJSONObject(i));
            if (!step.property.equals(last)) {
                if (last != null) completed.add(last);
                if (completed.contains(step.property)) throw new IllegalArgumentException("Invalid property order.");
                last = step.property; pdfSeen = false;
            } else if (pdfSeen || !step.kind.equals("pdf")) throw new IllegalArgumentException("Invalid media/PDF sequence.");
            pdfSeen = step.kind.equals("pdf");
            for (Attachment file : step.files) {
                if (!ids.add(file.id)) throw new IllegalArgumentException("Duplicate attachment ID.");
                total = HandoffRules.file(file.id, file.name, file.mime, file.size, file.sha256, ++count, total);
            }
            steps.add(step);
        }
    }
}
