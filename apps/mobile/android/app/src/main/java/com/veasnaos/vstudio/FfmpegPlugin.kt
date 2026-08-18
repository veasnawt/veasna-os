package com.veasnaos.vstudio

import android.content.ContentValues
import android.os.Build
import android.provider.MediaStore
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.ReturnCode
import com.arthenica.ffmpegkit.Session
import com.arthenica.ffmpegkit.Statistics
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/** Runs the exact FFmpeg argv `buildExportPlan.ts` already produces for desktop export, on-device —
 *  the first custom native plugin in this repo (see the mobile-export plan for why: ffmpeg-kit was
 *  retired in 2025 and its actively-maintained high-level replacement doesn't expose arbitrary
 *  `-filter_complex` commands, only fixed operations, so this project depends directly on a
 *  ffmpeg-kit-compatible AAR and talks to it with ffmpeg-kit's own API instead).
 *
 *  `executeWithArgumentsAsync` (an argv array, not one shell-quoted string) is used specifically
 *  because `buildExportPlan.ts`'s filter graphs are full of characters (`:`, `'`, `;`, `,`) that would
 *  otherwise need re-escaping into a single command string just to be un-escaped again — the JS side
 *  already hands over `plan.args` as a plain string array, so this passes it straight through with no
 *  quoting step to get wrong. */
@CapacitorPlugin(name = "Ffmpeg")
class FfmpegPlugin : Plugin() {
    private val sessions = mutableMapOf<String, Long>()
    private val totalDurationMs = mutableMapOf<String, Double>()

    @PluginMethod
    fun run(call: PluginCall) {
        val jobId = call.getString("jobId") ?: return call.reject("Missing jobId")
        val argsArray = call.getArray("args") ?: return call.reject("Missing args")
        val durationSeconds = call.getDouble("duration") ?: 0.0
        totalDurationMs[jobId] = durationSeconds * 1000.0

        val args = arrayOfNulls<String>(argsArray.length())
        for (i in 0 until argsArray.length()) {
            args[i] = argsArray.getString(i)
        }

        val session = FFmpegKit.executeWithArgumentsAsync(
            args,
            { completed: Session ->
                val payload = JSObject()
                payload.put("jobId", jobId)
                when {
                    ReturnCode.isSuccess(completed.returnCode) -> notifyListeners("done", payload)
                    ReturnCode.isCancel(completed.returnCode) -> notifyListeners("cancelled", payload)
                    else -> {
                        // `allLogsAsString` includes FFmpeg's own startup banner — a "configuration:"
                        // line listing every build flag, hundreds of characters on its OWN single line.
                        // Truncating by character count (the first version of this) sliced straight
                        // through the middle of that line rather than around it, dumping build-flag
                        // noise into the UI ahead of the actual error. Truncating by LINE instead keeps
                        // whole lines intact, so the real failure (near the end) survives legibly.
                        val full = completed.failStackTrace ?: completed.allLogsAsString ?: "FFmpeg exited with code ${completed.returnCode}"
                        val tail = full.lines().takeLast(12).joinToString("\n").trim()
                        payload.put("error", tail)
                        notifyListeners("failed", payload)
                    }
                }
                sessions.remove(jobId)
                totalDurationMs.remove(jobId)
            },
            { /* log callback: not surfaced — `failStackTrace`/`allLogsAsString` above cover the failure case */ },
            { stats: Statistics ->
                val total = totalDurationMs[jobId] ?: 0.0
                val fraction = if (total > 0) (stats.time / total).coerceIn(0.0, 1.0) else 0.0
                val payload = JSObject()
                payload.put("jobId", jobId)
                payload.put("fraction", fraction)
                notifyListeners("progress", payload)
            }
        )
        sessions[jobId] = session.sessionId
        call.resolve()
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val jobId = call.getString("jobId") ?: return call.reject("Missing jobId")
        sessions[jobId]?.let { FFmpegKit.cancel(it) }
        call.resolve()
    }

    /** Copies a finished export into the device's own Gallery/Movies app via `MediaStore`, so a
     *  render is available the moment it finishes without requiring the user to go through the share
     *  sheet just to keep a copy — the share sheet (`ExportDialog.tsx`'s "Save / Share") stays around
     *  for sending it to a specific app (Telegram, etc.), this is just the automatic "don't lose it"
     *  path. Scoped-storage `MediaStore` insert (API 29+) needs no runtime permission at all — this is
     *  the primary, verified path (the only device this was tested on is API 29). Pre-29 devices are
     *  vanishingly rare at this point (Android ≤8.1, 2016-2017 hardware) and would need a separate
     *  `WRITE_EXTERNAL_STORAGE` runtime-permission flow this app doesn't have yet; `insert()` there
     *  will just fail with a `SecurityException` that surfaces as a normal `reject`, not a crash — a
     *  deliberate "best effort on old versions, not a hard requirement" scope cut, not an oversight. */
    @PluginMethod
    fun saveToGallery(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("Missing path")
        val fileName = call.getString("fileName") ?: return call.reject("Missing fileName")
        try {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/VStudio")
                    put(MediaStore.Video.Media.IS_PENDING, 1)
                }
            }
            val itemUri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                ?: return call.reject("Could not create a gallery entry")

            resolver.openOutputStream(itemUri).use { out ->
                if (out == null) return call.reject("Could not open the gallery entry for writing")
                File(path).inputStream().use { input -> input.copyTo(out) }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear()
                values.put(MediaStore.Video.Media.IS_PENDING, 0)
                resolver.update(itemUri, values, null, null)
            }

            val result = JSObject()
            result.put("uri", itemUri.toString())
            call.resolve(result)
        } catch (e: Exception) {
            call.reject(e.message ?: "Failed to save to gallery", e)
        }
    }
}
