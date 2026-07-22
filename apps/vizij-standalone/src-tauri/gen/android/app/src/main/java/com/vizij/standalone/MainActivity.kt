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

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    // Warm start (app already running): capture the new model. A running web
    // app won't auto-reload yet — relaunching (cold start via `am start`) is the
    // reliable path for swapping models during testing.
    captureOpenedModel(intent)
  }

  // Copy the VIEW intent's model bytes to `<filesDir>/opened_model.glb`, which
  // the Rust side exposes to the frontend via `get_glb_source`.
  private fun captureOpenedModel(intent: Intent?) {
    if (intent?.action != Intent.ACTION_VIEW) return
    val uri = intent.data ?: return
    try {
      contentResolver.openInputStream(uri)?.use { input ->
        File(filesDir, OPENED_MODEL_FILE).outputStream().use { output ->
          input.copyTo(output)
        }
      }
      Log.i(TAG, "Captured opened model from $uri")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to capture opened model from $uri", e)
    }
  }

  companion object {
    private const val TAG = "VizijStandalone"
    private const val OPENED_MODEL_FILE = "opened_model.glb"
  }
}
