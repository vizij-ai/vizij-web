package com.vizij.standalone

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import java.io.File

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    // Capture an "open with" / VIEW intent BEFORE the web app starts, so the
    // Rust `get_glb_source` command finds the model on first read.
    captureOpenedModel(intent)
    super.onCreate(savedInstanceState)
  }

  // Copy the VIEW intent's model bytes to `<filesDir>/opened_model.glb`, which
  // the Rust side exposes to the frontend via `get_glb_source`. The file holds
  // what this launch opened and nothing else: the page loads it in place of the
  // default face, so a launch without a model and a copy that fails leave none.
  // An intent reaching the running activity is not captured: the page read its
  // model when it loaded and does not ask again, so such a model is neither
  // shown nor kept.
  private fun captureOpenedModel(intent: Intent?) {
    val model = File(filesDir, OPENED_MODEL_FILE)
    model.delete()
    if (intent?.action != Intent.ACTION_VIEW) return
    val uri = intent.data ?: return
    try {
      contentResolver.openInputStream(uri)?.use { input ->
        model.outputStream().use { output ->
          input.copyTo(output)
        }
      }
      Log.i(TAG, "Captured opened model from $uri")
    } catch (e: Exception) {
      model.delete()
      Log.e(TAG, "Failed to capture opened model from $uri", e)
    }
  }

  companion object {
    private const val TAG = "VizijStandalone"
    private const val OPENED_MODEL_FILE = "opened_model.glb"
  }
}
