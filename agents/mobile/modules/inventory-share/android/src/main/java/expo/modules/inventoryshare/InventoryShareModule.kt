package expo.modules.inventoryshare

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class InventoryShareModule : Module() {
  private var pending: Promise? = null
  private val grants = mutableListOf<Uri>()
  override fun definition() = ModuleDefinition {
    Name("InventoryShare")
    AsyncFunction("shareAsync") { paths: List<String>, mime: String, text: String, target: String, promise: Promise ->
      require(pending == null) { "Another share is open." }
      require(target == "com.whatsapp" || target == "com.whatsapp.w4b") { "Choose WhatsApp or WhatsApp Business." }
      require(paths.isNotEmpty() && paths.size <= 100 && text.length <= 16000) { "Invalid attachment package." }
      val context = appContext.reactContext ?: error("Session unavailable.")
      val root = File(context.cacheDir, "rp-handoffs").canonicalFile
      val uris = ArrayList<Uri>()
      for (path in paths) {
        val parsed = Uri.parse(path)
        require(parsed.scheme == "file") { "Only prepared files can be shared." }
        val file = File(parsed.path ?: "").canonicalFile
        require(file.path.startsWith(root.path + File.separator) && file.isFile && file.length() in 1..41943040) { "Prepared attachment unavailable." }
        uris.add(FileProvider.getUriForFile(context, context.packageName + ".InventoryShareProvider", file))
      }
      val intent = Intent(if (uris.size > 1) Intent.ACTION_SEND_MULTIPLE else Intent.ACTION_SEND).apply {
        type = mime
        setPackage(target)
        if (uris.size > 1) putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris) else putExtra(Intent.EXTRA_STREAM, uris[0])
        putExtra(Intent.EXTRA_TEXT, text)
        clipData = ClipData.newUri(context.contentResolver, "Property attachments", uris[0]).also { data -> uris.drop(1).forEach { data.addItem(ClipData.Item(it)) } }
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      require(intent.resolveActivity(context.packageManager) != null) { "The selected WhatsApp app is not installed." }
      pending = promise
      try {
        uris.forEach { context.grantUriPermission(target, it, Intent.FLAG_GRANT_READ_URI_PERMISSION); grants.add(it) }
        appContext.throwingActivity.startActivityForResult(intent, 51428)
      } catch (e: Exception) { pending = null; promise.reject("SHARE_FAILED", "Could not open the selected WhatsApp app.", e) }
    }
    OnActivityResult { _, result ->
      if (result.requestCode == 51428) { pending?.resolve("handoff_closed"); pending = null }
    }
    Function("revoke") {
      val context = appContext.reactContext
      grants.forEach { context?.revokeUriPermission(it, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
      grants.clear()
    }
  }
}
