package com.realtypandit.shareproof;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** CRM pilot: only downloads from the fixed API; no staff login or automatic send. */
public final class CrmHandoffActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler expiryHandler = new Handler();
    private SharedPreferences saved;
    private TextView review, status;
    private Button download, open, next, retry, cancel;
    private HandoffManifest manifest;
    private String session, fingerprint, directoryName;
    private int step;
    private boolean busy, ready, handedOff;
    private volatile boolean cancelled;
    private volatile long generation;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        saved = getSharedPreferences("crm-pilot", MODE_PRIVATE);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (16 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding, padding, padding);
        ScrollView scroll = new ScrollView(this); scroll.addView(content); setContentView(scroll);
        TextView caution = new TextView(this);
        caution.setText("My WhatsApp — CRM pilot\nRecipient targeting, media order and first-photo caption placement are unverified. Check the actual WhatsApp preview before Send. We never send automatically or confirm delivery.");
        content.addView(caution);
        review = new TextView(this); content.addView(review);
        status = new TextView(this);
        status.setAccessibilityLiveRegion(android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE);
        content.addView(status);
        download = button(content, "Download all selected files / resume", this::downloadAll);
        open = button(content, "Review and open this step", this::reviewStep);
        next = button(content, "Next step (only after reviewing WhatsApp)", () -> {
            if (!handedOff || busy || manifest == null || step + 1 >= manifest.steps.size()) return;
            step++; handedOff = false; persist(); show();
            status.setText("Next step ready. Review it, then deliberately open its preview.");
        });
        retry = button(content, "Retry this step — may duplicate", () -> {
            if (!handedOff || busy) return;
            new AlertDialog.Builder(this).setTitle("Inspect the WhatsApp chat first")
                .setMessage("The previous handoff may already have been sent. Retrying can duplicate it. This app cannot detect Send or delivery.")
                .setNegativeButton("Cancel", null).setPositiveButton("Retry deliberately", (d, w) -> {
                    handedOff = false; persist(); show(); reviewStep();
                }).show();
        });
        cancel = button(content, "Cancel and clear temporary files", () -> {
            new AlertDialog.Builder(this).setTitle("Clear this handoff?")
                .setMessage("Temporary files and local handoff state will be removed. Files already copied into WhatsApp cannot be recalled.")
                .setNegativeButton("Keep", null).setPositiveButton("Clear", (d, w) -> {
                    clear(); show(); status.setText("Cleared. Prepare a new handoff in CRM.");
                }).show();
        });
        restore();
        receive(getIntent());
        show();
    }

    private Button button(LinearLayout content, String label, Runnable action) {
        Button result = new Button(this); result.setText(label); result.setOnClickListener(v -> action.run());
        content.addView(result); return result;
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (busy) { status.setText("Still preparing this handoff. Return to CRM and open the new handoff after preparation finishes."); return; }
        setIntent(intent); receive(intent);
    }
    private void receive(Intent intent) {
        try {
            if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
                if (manifest == null) status.setText("Select My WhatsApp from a property in CRM to start.");
                return;
            }
            String token = HandoffRules.launchToken(intent.getDataString(), intent.getStringExtra("handoff_token"));
            // Remove capabilities from the retained activity intent and instance state.
            setIntent(new Intent());
            String hash = HandoffRules.hex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII)));
            if (hash.equals(fingerprint) && manifest != null) { status.setText("Existing handoff restored. No automatic retry or Send."); return; }
            if (manifest != null) {
                new AlertDialog.Builder(this).setTitle("Replace the current handoff?")
                    .setMessage("This clears current temporary files. Previous WhatsApp handoffs remain unconfirmed.")
                    .setNegativeButton("Keep current", null).setPositiveButton("Replace", (d, w) -> claim(token, hash)).show();
            } else claim(token, hash);
        } catch (Exception e) { status.setText("Invalid launch. Prepare a new handoff in CRM."); }
    }
    private void restore() {
        try {
            String json = saved.getString("manifest", null);
            if (json == null) return;
            manifest = new HandoffManifest(new JSONObject(json), System.currentTimeMillis());
            session = saved.getString("session", null); HandoffRules.credential(session);
            fingerprint = saved.getString("fingerprint", null);
            directoryName = saved.getString("directory", "");
            if (!directoryName.matches("[0-9]+_[a-f0-9-]{36}") || ShareRules.expired(directoryName, System.currentTimeMillis())) throw new IllegalStateException();
            step = saved.getInt("step", 0); handedOff = saved.getBoolean("handedOff", false);
            if (step < 0 || step >= manifest.steps.size()) throw new IllegalStateException();
            ready = saved.getBoolean("ready", false);
            if (ready) for (HandoffManifest.Step item : manifest.steps) for (HandoffManifest.Attachment attachment : item.files) {
                File file = localFile(attachment); if (!file.isFile() || file.length() != attachment.size) ready = false;
            }
            scheduleExpiry();
            status.setText(ready ? "Handoff restored. Send and delivery are unconfirmed." : "Preparation was interrupted. Tap Download to resume safely.");
        } catch (Exception e) { clear(); status.setText("Previous handoff expired or cannot be resumed. Prepare it again in CRM."); }
    }
    private void claim(String token, String hash) {
        clear(); busy = true; cancelled = false; show(); status.setText("Claiming the selected CRM handoff…");
        final long job = generation;
        worker.execute(() -> {
            HttpsURLConnection connection = null;
            try {
                connection = connection("/claim", token);
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json"); connection.setFixedLengthStreamingMode(2);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write("{}".getBytes(StandardCharsets.UTF_8)); }
                if (connection.getResponseCode() != 200) throw new IllegalStateException();
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream input = connection.getInputStream()) { ShareRules.copy(input, bytes, 256 * 1024); }
                JSONObject result = new JSONObject(bytes.toString("UTF-8"));
                String claimed = result.getString("session"); HandoffRules.credential(claimed);
                HandoffManifest selected = new HandoffManifest(result.getJSONObject("manifest"), System.currentTimeMillis());
                runOnUiThread(() -> {
                    if (isDestroyed() || cancelled || job != generation) return;
                    manifest = selected; session = claimed; fingerprint = hash;
                    directoryName = manifest.expiry + "_" + UUID.randomUUID();
                    busy = false;
                    if (!persist()) { clear(); show(); status.setText("Cannot safely save this handoff. Prepare again in CRM."); return; }
                    scheduleExpiry(); downloadAll();
                });
            } catch (Exception e) { runOnUiThread(() -> {
                if (isDestroyed() || job != generation) return; busy = false; show();
                status.setText("The handoff could not be claimed. It may be expired or already used, or the network is unavailable. Prepare a new handoff in CRM; no WhatsApp preview opened.");
            }); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }
    // Platform TLS verification stays enabled and redirects are never followed.
    private HttpsURLConnection connection(String path, String credential) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(HandoffRules.API + path).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15_000); connection.setReadTimeout(15_000);
        connection.setRequestProperty("Authorization", "Bearer " + credential);
        connection.setRequestProperty("Accept-Encoding", "identity");
        return connection;
    }
    private File directory() { return new File(getCacheDir(), "handoff/" + directoryName); }
    private File localFile(HandoffManifest.Attachment attachment) {
        return new File(directory(), attachment.id + "." + extension(attachment.mime));
    }
    private String extension(String mime) {
        String ext = android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        return ext == null ? "bin" : ext;
    }
    private void downloadAll() {
        if (busy || manifest == null || ready) return;
        try { HandoffRules.expires(manifest.expiry, System.currentTimeMillis()); }
        catch (RuntimeException e) { clear(); show(); status.setText("Expired. Prepare a new handoff in CRM."); return; }
        busy = true; cancelled = false; show(); status.setText("Downloading and checking ALL selected attachments before any preview…");
        final HandoffManifest selected = manifest;
        final File dir = directory();
        final String selectedSession = session;
        final long job = generation;
        worker.execute(() -> {
            try {
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException();
                long total = 0;
                for (HandoffManifest.Step item : selected.steps) for (HandoffManifest.Attachment attachment : item.files) {
                    checkActive(selected.expiry, job);
                    File file = new File(dir, attachment.id + "." + extension(attachment.mime)), partial = new File(dir, file.getName() + ".part");
                    HttpsURLConnection connection = connection("/files/" + attachment.id, selectedSession);
                    try {
                        if (connection.getResponseCode() != 200 || !attachment.mime.equals(connection.getContentType())
                            || connection.getContentLengthLong() != attachment.size) throw new IllegalStateException();
                        MessageDigest digest = MessageDigest.getInstance("SHA-256");
                        try (InputStream input = new DigestInputStream(connection.getInputStream(), digest);
                             FileOutputStream output = new FileOutputStream(partial)) {
                            byte[] buffer = new byte[8192]; long size = 0; int count;
                            while ((count = input.read(buffer)) != -1) {
                                checkActive(selected.expiry, job); size += count;
                                if (size > attachment.size || size > ShareRules.MAX_BYTES - total) throw new IllegalStateException();
                                output.write(buffer, 0, count);
                            }
                            if (size != attachment.size) throw new IllegalStateException();
                            total += size;
                        }
                        HandoffRules.digest(attachment.sha256, digest);
                        if (file.exists() && !file.delete()) throw new IllegalStateException();
                        if (!partial.renameTo(file)) throw new IllegalStateException();
                    } finally { connection.disconnect(); if (partial.exists()) partial.delete(); }
                }
                checkActive(selected.expiry, job);
                runOnUiThread(() -> {
                    if (isDestroyed() || cancelled || job != generation) return;
                    busy = false; ready = true;
                    if (!persist()) { clear(); show(); status.setText("Cannot save preparation safely. Prepare again in CRM."); return; }
                    show(); status.setText("All files verified. Review the recipient, selected app, property details and attachment order before opening this step.");
                });
            } catch (Exception e) {
                delete(dir);
                runOnUiThread(() -> { if (isDestroyed() || job != generation) return;
                    busy = false; ready = false; persist(); show();
                    status.setText("Preparation failed or expired. No preview opened. Check your network and deliberately retry Download; if expired, prepare again in CRM.");
                });
            }
        });
    }
    private void checkActive(long expiry, long job) {
        if (job != generation || cancelled || Thread.currentThread().isInterrupted() || System.currentTimeMillis() >= expiry) throw new IllegalStateException();
    }
    private void reviewStep() {
        if (busy || !ready || handedOff || manifest == null) return;
        if (System.currentTimeMillis() >= manifest.expiry) { clear(); show(); status.setText("Expired. Prepare again in CRM."); return; }
        new AlertDialog.Builder(this).setTitle("Check the actual WhatsApp preview")
            .setMessage(summary() + "\n\nUnverified pilot: if WhatsApp asks you to choose a recipient, or changes files/details/order, cancel and report the failure. Review your sending account. Send is always manual.")
            .setNegativeButton("Cancel", null).setPositiveButton("Open preview", (d, w) -> openStep()).show();
    }
    private void openStep() {
        if (busy || handedOff || manifest == null || !ready) return;
        try {
            HandoffRules.expires(manifest.expiry, System.currentTimeMillis());
            HandoffManifest.Step current = manifest.steps.get(step);
            ArrayList<Uri> uris = new ArrayList<>();
            for (HandoffManifest.Attachment attachment : current.files) {
                File file = localFile(attachment);
                if (!file.isFile() || file.length() != attachment.size) throw new IllegalStateException();
                uris.add(FileProvider.getUriForFile(this, getPackageName() + ".files", file));
            }
            Intent intent = ShareIntents.create(manifest.app, manifest.recipient, current.text, current.mime, uris);
            handedOff = true;
            if (!persist()) { handedOff = false; throw new IllegalStateException(); }
            startActivity(intent); show();
            status.setText("Handed to WhatsApp. Send and delivery are UNCONFIRMED. On return, inspect the chat before choosing Next or Retry. Nothing advances automatically.");
        } catch (RuntimeException e) {
            handedOff = false; persist(); show();
            status.setText("Could not open the selected WhatsApp app or read the prepared files. Check that app is installed. Nothing is confirmed sent; return to CRM for the independent Share sheet.");
        }
    }
    private String summary() {
        HandoffManifest.Step current = manifest.steps.get(step);
        StringBuilder text = new StringBuilder("Recipient: ").append(manifest.recipient)
            .append("\nSending app: ").append(manifest.app.equals("com.whatsapp") ? "WhatsApp" : "WhatsApp Business")
            .append("\nStep ").append(step + 1).append(" of ").append(manifest.steps.size())
            .append("\nProperty: ").append(current.label).append("\nType: ").append(current.kind)
            .append("\nSelected attachment order:\n");
        for (int i = 0; i < current.files.size(); i++) text.append(i + 1).append(". ").append(current.files.get(i).name).append('\n');
        return text.append("\nPrepared details:\n").append(current.text).toString();
    }
    private void show() {
        if (review == null) return;
        review.setText(manifest == null ? "No prepared CRM handoff." : summary());
        download.setEnabled(!busy && manifest != null && !ready);
        open.setEnabled(!busy && ready && !handedOff);
        retry.setEnabled(!busy && ready && handedOff);
        next.setEnabled(!busy && ready && handedOff && step + 1 < manifest.steps.size());
        cancel.setEnabled(busy || manifest != null);
    }
    private boolean persist() {
        if (manifest == null) return true;
        return saved.edit().putString("manifest", manifest.json.toString()).putString("session", session)
            .putString("fingerprint", fingerprint).putString("directory", directoryName).putInt("step", step)
            .putBoolean("ready", ready).putBoolean("handedOff", handedOff).commit();
    }
    private void scheduleExpiry() {
        expiryHandler.removeCallbacksAndMessages(null);
        expiryHandler.postDelayed(() -> { clear(); show(); status.setText("Handoff expired. Temporary files cleared; prepare again in CRM."); },
            Math.max(0, manifest.expiry - System.currentTimeMillis()));
    }
    private void clear() {
        generation++; cancelled = true; busy = false;
        expiryHandler.removeCallbacksAndMessages(null);
        if (directoryName != null) delete(directory());
        saved.edit().clear().commit();
        manifest = null; session = null; fingerprint = null; directoryName = null;
        step = 0; ready = false; handedOff = false;
    }
    private void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        if (file.isFile()) try { revokeUriPermission(FileProvider.getUriForFile(this, getPackageName() + ".files", file), Intent.FLAG_GRANT_READ_URI_PERMISSION); }
            catch (IllegalArgumentException ignored) { /* Partial files were never granted. */ }
        if (file.exists() && !file.delete()) file.deleteOnExit();
    }
    @Override protected void onResume() {
        super.onResume();
        if (manifest != null && System.currentTimeMillis() >= manifest.expiry) { clear(); show(); status.setText("Expired. Prepare again in CRM."); }
        File[] dirs = new File(getCacheDir(), "handoff").listFiles();
        if (dirs != null) for (File dir : dirs) if (ShareRules.expired(dir.getName(), System.currentTimeMillis())) delete(dir);
    }
    @Override protected void onDestroy() {
        cancelled = true; worker.shutdownNow(); expiryHandler.removeCallbacksAndMessages(null); super.onDestroy();
    }
}
