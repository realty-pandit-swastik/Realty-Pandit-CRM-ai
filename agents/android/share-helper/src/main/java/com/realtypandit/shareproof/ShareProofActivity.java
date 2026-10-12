package com.realtypandit.shareproof;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ShareProofActivity extends Activity {
    private final ArrayList<Uri> selected = new ArrayList<>();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler expiryHandler = new Handler();
    private EditText recipient, property, details;
    private TextView status;
    private Button pick, cover, open, clear;
    private RadioGroup apps;
    private boolean busy, handedOff;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        handedOff = state != null && state.getBoolean("handedOff");
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (16 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding, padding, padding);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
        TextView intro = new TextView(this);
        intro.setText("My WhatsApp handoff proof\nTest files and a consenting recipient only. Check the recipient, attachments, order and details in WhatsApp before tapping Send. Returning here does not prove a send.");
        content.addView(intro);
        recipient = field(content, "Recipient — include + and country code", InputType.TYPE_CLASS_PHONE);
        property = field(content, "Property label", InputType.TYPE_CLASS_TEXT);
        details = field(content, "Prepared property details (media step only)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        apps = new RadioGroup(this);
        for (String label : new String[]{"WhatsApp", "WhatsApp Business"}) {
            RadioButton app = new RadioButton(this);
            app.setId(android.view.View.generateViewId());
            app.setText(label);
            app.setTag(label.equals("WhatsApp") ? "com.whatsapp" : "com.whatsapp.w4b");
            apps.addView(app);
        }
        content.addView(apps);
        pick = button(content, "Select step attachments", () -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*")
                .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*", "application/pdf"});
            try { startActivityForResult(intent, 1); }
            catch (android.content.ActivityNotFoundException e) { status.setText("No file picker is available."); }
        });
        cover = button(content, "Choose first photo", () -> {
            ArrayList<Uri> photos = new ArrayList<>();
            ArrayList<String> names = new ArrayList<>();
            try {
                for (Uri uri : selected) {
                    String type = getContentResolver().getType(uri);
                    if (type != null && type.startsWith("image/")) { photos.add(uri); names.add(displayName(uri)); }
                }
            } catch (RuntimeException e) { status.setText("Cannot read the selected files. Select them again."); return; }
            if (busy || handedOff || photos.isEmpty()) { status.setText("Select a new photo step first."); return; }
            new AlertDialog.Builder(this).setTitle("First photo")
                .setItems(names.toArray(new String[0]), (dialog, index) -> {
                    Uri cover = photos.get(index);
                    selected.remove(cover);
                    selected.add(0, cover);
                    showSelection();
                }).show();
        });
        open = button(content, "Open client in My WhatsApp", this::prepare);
        clear = button(content, "Clear step and temporary files", () -> {
            selected.clear();
            handedOff = false;
            deleteFiles(new File(getCacheDir(), "handoff"));
            status.setText("Cleared. Select the next property's files or one separate PDF; the recipient is retained.");
        });
        status = new TextView(this);
        status.setAccessibilityLiveRegion(android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE);
        status.setText("Select photos/videos for one property, or one separate PDF. No app is selected automatically.");
        content.addView(status);
    }

    private EditText field(LinearLayout content, String label, int inputType) {
        TextView caption = new TextView(this);
        caption.setText(label);
        content.addView(caption);
        EditText input = new EditText(this);
        input.setId(android.view.View.generateViewId());
        caption.setLabelFor(input.getId());
        input.setInputType(inputType);
        input.setSaveEnabled(false);
        content.addView(input);
        return input;
    }

    private Button button(LinearLayout content, String title, Runnable action) {
        Button button = new Button(this);
        button.setText(title);
        button.setOnClickListener(v -> action.run());
        content.addView(button);
        return button;
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != 1 || result != RESULT_OK || data == null) return;
        selected.clear();
        if (data.getClipData() != null) {
            if (data.getClipData().getItemCount() > ShareRules.MAX_FILES) {
                status.setText("Select at most 100 attachments.");
                return;
            }
            for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                Uri uri = data.getClipData().getItemAt(i).getUri();
                if (!selected.contains(uri)) selected.add(uri);
            }
        } else if (data.getData() != null) selected.add(data.getData());
        handedOff = false;
        showSelection();
    }

    private void showSelection() {
        StringBuilder summary = new StringBuilder("Selected order:\n");
        for (int i = 0; i < selected.size(); i++) {
            summary.append(i + 1).append(". ").append(displayName(selected.get(i))).append('\n');
        }
        status.setText(summary);
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (RuntimeException ignored) { /* Preparation will report inaccessible content. */ }
        return "Attachment";
    }

    private void setBusy(boolean value) {
        busy = value;
        pick.setEnabled(!value);
        cover.setEnabled(!value);
        open.setEnabled(!value);
        clear.setEnabled(!value);
        recipient.setEnabled(!value);
        property.setEnabled(!value);
        details.setEnabled(!value);
        for (int i = 0; i < apps.getChildCount(); i++) apps.getChildAt(i).setEnabled(!value);
    }

    private void prepare() {
        if (busy) return;
        if (handedOff) {
            status.setText("This step was already handed to WhatsApp. Clear it or select the next step; inspect the chat before retrying.");
            return;
        }
        try {
            String phone = recipient.getText().toString().trim();
            ShareRules.recipientJid(phone);
            String label = property.getText().toString().trim();
            if (label.isEmpty()) throw new IllegalArgumentException("Enter the intended property label.");
            if (apps.getCheckedRadioButtonId() == -1) throw new IllegalArgumentException("Choose the sending WhatsApp app explicitly.");
            String app = findViewById(apps.getCheckedRadioButtonId()).getTag().toString();
            ArrayList<Uri> sources = new ArrayList<>(selected);
            List<String> types = new ArrayList<>();
            for (Uri uri : sources) types.add(getContentResolver().getType(uri));
            String mime = ShareRules.mimeType(types);
            String text = mime.equals("application/pdf") ? "" : details.getText().toString();
            new AlertDialog.Builder(this).setTitle("Review intended handoff")
                .setMessage("Recipient: " + phone + "\nProperty: " + label + "\nApp: " + (app.equals("com.whatsapp") ? "WhatsApp" : "WhatsApp Business")
                    + "\nAttachments: " + sources.size() + "\n\n" + text + "\n\nRecipient targeting remains unverified. Check the preview before Send.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Open preview", (dialog, which) -> copyAndOpen(app, phone, text, mime, sources, types)).show();
        } catch (RuntimeException e) { status.setText(e.getMessage()); }
    }

    private void copyAndOpen(String app, String phone, String text, String mime, ArrayList<Uri> sources, List<String> types) {
        setBusy(true);
        status.setText("Preparing selected files…");
        worker.execute(() -> {
            File directory = new File(getCacheDir(), "handoff/" + (System.currentTimeMillis() + ShareRules.TTL_MS) + "_" + UUID.randomUUID());
            try {
                if (!directory.mkdirs()) throw new java.io.IOException("Cannot prepare temporary files.");
                ArrayList<Uri> files = new ArrayList<>();
                long size = 0;
                for (int i = 0; i < sources.size(); i++) {
                    String extension = android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(types.get(i));
                    File file = new File(directory, String.format(java.util.Locale.ROOT, "%03d.%s", i + 1, extension == null ? "bin" : extension));
                    try (InputStream input = getContentResolver().openInputStream(sources.get(i)); FileOutputStream output = new FileOutputStream(file)) {
                        if (input == null) throw new java.io.IOException("An attachment cannot be read.");
                        size += ShareRules.copy(input, output, ShareRules.MAX_BYTES - size);
                    }
                    files.add(FileProvider.getUriForFile(this, getPackageName() + ".files", file));
                }
                runOnUiThread(() -> {
                    if (isDestroyed() || isFinishing()) { deleteFiles(directory); return; }
                    setBusy(false);
                    try {
                        if (ShareRules.expired(directory.getName(), System.currentTimeMillis())) throw new IllegalStateException("Preparation expired. Try again.");
                        startActivity(ShareIntents.create(app, phone, text, mime, files));
                        handedOff = true;
                        status.setText("Handed to WhatsApp. Verify the recipient and prepared content in the preview. Send and delivery are unconfirmed. Clear or select the next step on return.");
                        long expiry = Long.parseLong(directory.getName().split("_", 2)[0]);
                        expiryHandler.postDelayed(() -> deleteFiles(directory), Math.max(0, expiry - System.currentTimeMillis()));
                    } catch (RuntimeException e) {
                        deleteFiles(directory);
                        status.setText("Could not open the selected WhatsApp app. Use CRM Share sheet instead. Nothing is confirmed sent.");
                    }
                });
            } catch (Exception e) {
                deleteFiles(directory);
                runOnUiThread(() -> {
                    if (!isDestroyed()) { setBusy(false); status.setText("Preparation failed. Re-select files and retry. " + e.getMessage()); }
                });
            }
        });
    }

    private void deleteFiles(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteFiles(child);
        if (file.isFile()) {
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", file);
            revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        if (file.exists() && !file.delete()) file.deleteOnExit();
    }

    @Override protected void onResume() {
        super.onResume();
        File[] directories = new File(getCacheDir(), "handoff").listFiles();
        if (directories != null) for (File dir : directories) {
            if (ShareRules.expired(dir.getName(), System.currentTimeMillis())) deleteFiles(dir);
        }
    }

    @Override protected void onDestroy() {
        worker.shutdownNow();
        super.onDestroy();
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("handedOff", handedOff);
        super.onSaveInstanceState(state);
    }
}
