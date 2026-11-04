package com.vizij.standalone

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import java.io.File

class MainActivity : TauriActivity() {
  private var resumed = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    // Capture an "open with" / VIEW intent BEFORE the web app starts, so the
    // Rust `get_glb_source` command finds the model on first read.
    captureOpenedModel(intent)
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    // Android restores a retained task in a new process under the intent that
    // started the task, and delivers this launch's own intent here, before the
    // first resume. That intent is the launch, and `setIntent` keeps it so across
    // an activity recreation. Once the activity has resumed an intent is not
    // captured: the page takes its model once, as it loads, so a model opened
    // then is neither shown nor kept.
    if (!resumed) {
      setIntent(intent)
      captureOpenedModel(intent)
    }
  }

  override fun onResume() {
    super.onResume()
    resumed = true
  }

  // Copy the VIEW intent's model bytes to `<filesDir>/opened_model.glb`, which
  // the Rust side exposes to the frontend via `get_glb_source`. The file holds
  // what this launch opened and nothing else: the page loads it in place of the
  // default face, so a launch without a model and a copy that fails leave none.
  // Restoring a task from recents is a launch under the intent that started the
  // task, whatever a later launch opened.
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
