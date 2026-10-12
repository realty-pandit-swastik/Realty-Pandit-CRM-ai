package com.realtypandit.shareproof;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;

final class ShareRules {
    static final long MAX_BYTES = 40L * 1024 * 1024;
    static final int MAX_FILES = 100;
    static final long TTL_MS = 10 * 60 * 1000;

    // Proof accepts already-normalized numbers; CRM must later use its existing phone helpers.
    static String recipientJid(String phone) {
        if (!phone.matches("\\+[1-9][0-9]{7,14}")) {
            throw new IllegalArgumentException("Enter a country-coded number, for example +<country code><number>.");
        }
        return phone.substring(1) + "@s.whatsapp.net";
    }

    static String mimeType(List<String> types) {
        if (types.isEmpty() || types.size() > MAX_FILES) {
            throw new IllegalArgumentException("Select 1–100 attachments.");
        }
        for (String type : types) {
            if (type == null || !type.matches("image/(jpeg|png|webp|gif|avif)|video/(mp4|webm|quicktime)|application/pdf")) {
                throw new IllegalArgumentException("Choose supported photos, videos, or a PDF.");
            }
        }
        if (types.contains("application/pdf") && types.size() != 1) {
            throw new IllegalArgumentException("Share the PDF as a separate step, without photos or videos.");
        }
        String first = types.get(0);
        if (types.stream().allMatch(first::equals)) return first;
        if (types.stream().allMatch(t -> t.startsWith("image/"))) return "image/*";
        if (types.stream().allMatch(t -> t.startsWith("video/"))) return "video/*";
        return "*/*";
    }

    static long copy(InputStream input, OutputStream output, long remaining) throws IOException {
        byte[] buffer = new byte[8192];
        long size = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (Thread.currentThread().isInterrupted()) throw new IOException("Preparation cancelled.");
            size += count;
            if (size > remaining) throw new IOException("Selected attachments exceed 40 MB.");
            output.write(buffer, 0, count);
        }
        if (size == 0) throw new IOException("An attachment is empty.");
        return size;
    }

    static boolean expired(String directory, long now) {
        try { return now >= Long.parseLong(directory.split("_", 2)[0]); }
        catch (NumberFormatException e) { return true; }
    }
}
