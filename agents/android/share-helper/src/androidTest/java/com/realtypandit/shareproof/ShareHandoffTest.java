package com.realtypandit.shareproof;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

public class ShareHandoffTest {
    @Test public void singleFileTargetsChosenAppWithReadOnlyGrantAndDetails() {
        Uri uri = Uri.parse("content://test/one");
        Intent intent = ShareIntents.create("com.whatsapp.w4b", "+12025550123", "Property details", "image/jpeg", new ArrayList<>(List.of(uri)));
        assertEquals(Intent.ACTION_SEND, intent.getAction());
        assertEquals("com.whatsapp.w4b", intent.getPackage());
        assertEquals("12025550123@s.whatsapp.net", intent.getStringExtra("jid"));
        assertEquals("Property details", intent.getStringExtra(Intent.EXTRA_TEXT));
        assertEquals(uri, intent.getParcelableExtra(Intent.EXTRA_STREAM));
        assertEquals(uri, intent.getClipData().getItemAt(0).getUri());
        assertEquals(Intent.FLAG_GRANT_READ_URI_PERMISSION, intent.getFlags());
    }
    @Test public void multipleFilesPreserveOrderWithoutRecipientChooser() {
        ArrayList<Uri> files = new ArrayList<>(List.of(Uri.parse("content://test/cover"), Uri.parse("content://test/video")));
        Intent intent = ShareIntents.create("com.whatsapp", "+12025550123", "Details", "*/*", files);
        assertEquals(Intent.ACTION_SEND_MULTIPLE, intent.getAction());
        assertEquals(files, intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM));
        assertEquals(files.get(0), intent.getClipData().getItemAt(0).getUri());
        assertEquals(files.get(1), intent.getClipData().getItemAt(1).getUri());
        assertEquals("12025550123@s.whatsapp.net", intent.getStringExtra("jid"));
        assertThrows(IllegalArgumentException.class, () -> ShareIntents.create("another.app", "+12025550123", "", "*/*", files));
    }
    @Test public void providerDeniesExpiredFilesAndWriteAccess() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        for (long expiry : new long[]{1, System.currentTimeMillis() + ShareRules.TTL_MS}) {
            File dir = new File(context.getCacheDir(), "handoff/" + expiry + "_provider-test");
            assertTrue(dir.mkdirs() || dir.isDirectory());
            File file = new File(dir, "001.pdf");
            try {
                try (FileOutputStream output = new FileOutputStream(file)) { output.write(42); }
                Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".files", file);
                assertThrows(java.io.FileNotFoundException.class, () -> context.getContentResolver().openFileDescriptor(uri, "w"));
                if (expiry == 1) {
                    assertThrows(java.io.FileNotFoundException.class, () -> context.getContentResolver().openFileDescriptor(uri, "r"));
                } else {
                    try (java.io.InputStream input = context.getContentResolver().openInputStream(uri)) { assertEquals(42, input.read()); }
                }
            } finally { assertTrue(file.delete()); assertTrue(dir.delete()); }
        }
    }
}
