package com.veasnawt.vcut

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.app.ActivityCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

private const val MIC_ALIAS = "microphone"

/**
 * Fills a gap in Capacitor's OWN Android permission handling: `BridgeWebChromeClient.onPermissionRequest`
 * (vendored inside `@capacitor/android`, not this app's code) unconditionally re-launches the RECORD_AUDIO
 * runtime-permission request on every `getUserMedia` call via its OWN separate `ActivityResultContracts`
 * launcher, with no `shouldShowRequestPermissionRationale` check first — and critically, that launcher is
 * NOT the same one `Plugin.requestPermissionForAlias` uses below, so Capacitor's own permission-state
 * cache (`Bridge`'s `PluginPermStates` prefs) never learns about denials that happen through it either.
 * Once Android permanently denies the permission (its own policy after enough denials), that WebView call
 * just silently returns denied with no dialog at all — `useVoiceRecording.ts`'s `getUserMedia` rejects with
 * `NotAllowedError` again, forever, with no way for the user to know WHY or what to do next.
 *
 * First attempt at this plugin tracked "have we ever asked" in its own SharedPreferences flag, reasoning
 * `shouldShowRequestPermissionRationale` alone can't distinguish "never asked" from "permanently denied"
 * (both return `false`). That broke in real testing: a debug build installed OVER an existing copy of the
 * app (not a clean reinstall) inherits the OS's real denial history, but starts with a FRESH SharedPreferences
 * flag — so `check()` always read "never asked" and never reported "blocked", even once the OS had already
 * permanently denied it. Fixed by not tracking anything ourselves at all: `request()` below performs a REAL
 * permission request through Capacitor's own `requestPermissionForAlias`/`getPermissionState` machinery —
 * calling the actual Android API this way means `shouldShowRequestPermissionRationale`, read immediately
 * after, reflects the OS's true history (which IS tracked system-side across every past caller, including
 * the WebView's own separate launcher above), not anything this plugin remembers on its own. `check()`
 * still can't fully disambiguate "never asked at all, ever" from "blocked" before the FIRST real `request()`
 * this plugin ever makes — an unavoidable Android limitation — so callers should treat `check()` as a
 * best-effort hint for showing UI before the first tap, and always call `request()` (not just rely on
 * `check()`) right before actually trying to record, since only `request()`'s result is authoritative.
 */
@CapacitorPlugin(name = "MicPermission", permissions = [Permission(alias = MIC_ALIAS, strings = [Manifest.permission.RECORD_AUDIO])])
class MicPermissionPlugin : Plugin() {
    @PluginMethod
    fun check(call: PluginCall) {
        call.resolve(stateResult())
    }

    @PluginMethod
    fun request(call: PluginCall) {
        if (getPermissionState(MIC_ALIAS) == PermissionState.GRANTED) {
            call.resolve(stateResult())
            return
        }
        requestPermissionForAlias(MIC_ALIAS, call, "onMicPermissionResult")
    }

    @PermissionCallback
    private fun onMicPermissionResult(call: PluginCall) {
        call.resolve(stateResult())
    }

    private fun stateResult(): JSObject {
        val state = when {
            getPermissionState(MIC_ALIAS) == PermissionState.GRANTED -> "granted"
            ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.RECORD_AUDIO) -> "prompt"
            else -> "blocked"
        }
        val result = JSObject()
        result.put("state", state)
        return result
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = Uri.fromParts("package", context.packageName, null)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Couldn't open Settings", e)
        }
    }
}
