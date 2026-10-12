package com.realtypandit.shareproof;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import java.util.ArrayList;

final class ShareIntents {
    static Intent create(String app, String phone, String details, String mime, ArrayList<Uri> files) {
        if (!app.equals("com.whatsapp") && !app.equals("com.whatsapp.w4b")) {
            throw new IllegalArgumentException("Choose WhatsApp or WhatsApp Business.");
        }
        if (files.isEmpty() || files.size() > ShareRules.MAX_FILES) {
            throw new IllegalArgumentException("Select 1–100 attachments.");
        }
        Intent intent = new Intent(files.size() == 1 ? Intent.ACTION_SEND : Intent.ACTION_SEND_MULTIPLE)
            .setPackage(app).setType(mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        // WhatsApp-specific compatibility dependency: handset proof must confirm this extra is honored.
        intent.putExtra("jid", ShareRules.recipientJid(phone));
        if (!details.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, details);
        if (files.size() == 1) intent.putExtra(Intent.EXTRA_STREAM, files.get(0));
        else intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, files);
        ClipData clip = ClipData.newRawUri("Selected attachments", files.get(0));
        for (int i = 1; i < files.size(); i++) clip.addItem(new ClipData.Item(files.get(i)));
        intent.setClipData(clip);
        return intent;
    }
}
