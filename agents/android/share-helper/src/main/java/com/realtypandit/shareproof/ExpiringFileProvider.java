package com.realtypandit.shareproof;

import android.net.Uri;
import android.os.ParcelFileDescriptor;
import androidx.core.content.FileProvider;
import java.io.FileNotFoundException;
import java.util.List;

public final class ExpiringFileProvider extends FileProvider {
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        List<String> path = uri.getPathSegments();
        if (!mode.equals("r") || path.size() != 3 || !path.get(0).equals("handoff")
            || ShareRules.expired(path.get(1), System.currentTimeMillis())) {
            throw new FileNotFoundException("Attachment access has expired or is not read-only.");
        }
        return super.openFile(uri, mode);
    }
}
