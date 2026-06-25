package com.vizij.standalone

import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Launch smoke test for the Vizij Standalone Android app.
 *
 * The whole app is a single WebView hosted by [MainActivity] (a Tauri
 * `TauriActivity`). This test launches the activity on a connected
 * emulator/device and asserts that:
 *  1. the app window reaches the foreground (catches "won't start" / native
 *     library load failures / boot-time Rust panics), and
 *  2. a WebView renders (catches a WebView/bridge that fails to initialize).
 *
 * It is intentionally shallow and dependency-light so it stays a reliable CI
 * gate rather than a flaky end-to-end check.
 */
@RunWith(AndroidJUnit4::class)
class AppLaunchTest {

    @Test
    fun appLaunchesAndRendersWebView() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val device = UiDevice.getInstance(instrumentation)
        val packageName = instrumentation.targetContext.packageName

        ActivityScenario.launch(MainActivity::class.java).use {
            val windowShown = device.wait(
                Until.hasObject(By.pkg(packageName).depth(0)),
                LAUNCH_TIMEOUT_MS,
            )
            assertTrue(
                "App window for $packageName did not appear within ${LAUNCH_TIMEOUT_MS}ms",
                windowShown,
            )

            // WebView exposes its accessibility class name as android.webkit.WebView
            // even for Tauri's RustWebView subclass, so matching the base class works.
            val webViewRendered = device.wait(
                Until.hasObject(By.clazz(WebView::class.java.name)),
                LAUNCH_TIMEOUT_MS,
            )
            assertTrue(
                "WebView did not render within ${LAUNCH_TIMEOUT_MS}ms — the app likely failed to start",
                webViewRendered,
            )
        }
    }

    companion object {
        private const val LAUNCH_TIMEOUT_MS = 30_000L
    }
}
