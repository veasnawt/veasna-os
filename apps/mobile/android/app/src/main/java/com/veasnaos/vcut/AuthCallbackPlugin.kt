package com.veasnaos.vcut

import android.content.Intent
import android.net.Uri
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Browser sign-in round trip for the Android app — the same one VCut Desktop uses. `openUrl` opens
 * `https://vcut.io/login?desktop=1` in the phone's own browser (Google refuses to sign anyone in from
 * inside an app's embedded WebView, so it can't happen in-app); once signed in, that page hands the
 * session back through a `vcut://auth-callback#access_token=...&refresh_token=...` link, which the
 * manifest routes to this activity and this plugin forwards to the web layer as an `authCallback`
 * event (`packages/vcut/src/api/nativeAuth.ts` turns it into a real Supabase session).
 */
@CapacitorPlugin(name = "AuthCallback")
class AuthCallbackPlugin : Plugin() {
    override fun load() {
        // Android may have closed VCut while the browser was open, so the link can also be what
        // launches it: that intent is already waiting on the activity by the time this plugin loads.
        handleIntent(activity?.intent)
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "vcut" || data.host != "auth-callback") return
        val payload = JSObject()
        payload.put("url", data.toString())
        // Retained until a listener consumes it — on a cold start the web page hasn't subscribed yet.
        notifyListeners("authCallback", payload, true)
        // Consumed: a rotation or activity recreation mustn't deliver the same tokens again.
        intent.data = null
    }

    @PluginMethod
    fun openUrl(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("Missing url")
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Couldn't open the browser to sign in", e)
        }
    }
}
