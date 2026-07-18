package com.vizij.standalone

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import java.io.File

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  // The web app decides what "back" means (close the settings page, leave the
  // loaded model, finally leave the app), so the history-based default in
  // WryActivity never applies here.
  override val handleBackNavigation: Boolean = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    // Capture an "open with" / VIEW intent BEFORE the web app starts, so the
    // Rust `get_glb_source` command finds the model on first read.
    captureOpenedModel(intent)
    super.onCreate(savedInstanceState)
    // Forward the system back gesture/button to the web app as an
    // `android-back` DOM event. The app routes it through the same handler as
    // its visible Back button and calls `VizijAndroid.leaveApp()` when there is
    // nowhere left to go back to.
    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          val view = webView
          if (view != null) {
            view.evaluateJavascript(
              "window.dispatchEvent(new CustomEvent('$BACK_EVENT'))",
              null,
            )
          } else {
            moveTaskToBack(true)
          }
        }
      },
    )
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(NativeBridge(), JS_BRIDGE_NAME)
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

  /** Native hooks the web app can call (exposed as `window.VizijAndroid`). */
  inner class NativeBridge {
    /** Called when a back gesture has nothing left to close in the web app. */
    @JavascriptInterface
    fun leaveApp() {
      runOnUiThread { moveTaskToBack(true) }
    }
  }

  companion object {
    private const val TAG = "VizijStandalone"
    private const val OPENED_MODEL_FILE = "opened_model.glb"
    private const val BACK_EVENT = "android-back"
    private const val JS_BRIDGE_NAME = "VizijAndroid"
  }
}
