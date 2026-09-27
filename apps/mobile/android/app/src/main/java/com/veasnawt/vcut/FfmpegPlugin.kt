package com.veasnawt.vcut

import android.content.ContentValues
import android.Manifest
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
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
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
@CapacitorPlugin(name = "Ffmpeg", permissions = [Permission(alias = "legacyGallery", strings = [Manifest.permission.WRITE_EXTERNAL_STORAGE])])
class FfmpegPlugin : Plugin() {
    private val sessions = mutableMapOf<String, Long>()
    private val totalDurationMs = mutableMapOf<String, Double>()

    @PluginMethod
    fun run(call: PluginCall) {
        val savesVideo = call.getString("outputPath") != null && call.getString("fileName") != null
        if (savesVideo && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("legacyGallery") != PermissionState.GRANTED) {
            requestPermissionForAlias("legacyGallery", call, "runWithGalleryPermission")
            return
        }
        startRun(call)
    }

    @PermissionCallback
    private fun runWithGalleryPermission(call: PluginCall) {
        // A denied Gallery permission must not discard the export itself.
        startRun(call)
    }

    private fun startRun(call: PluginCall) {
        val jobId = call.getString("jobId") ?: return call.reject("Missing jobId")
        // Audio extraction for captions also uses run(), without Gallery export metadata.
        val outputPath = call.getString("outputPath")
        val fileName = call.getString("fileName")
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
                if (fileName != null) payload.put("fileName", fileName)
                when {
                    ReturnCode.isSuccess(completed.returnCode) -> {
                        // Native callback owns saving, even after the export dialog is unmounted.
                        if (outputPath != null && fileName != null) {
                            try {
                                copyToGallery(outputPath, fileName)
                                payload.put("gallerySaved", true)
                            } catch (e: Exception) {
                                payload.put("gallerySaved", false)
                                payload.put("galleryError", e.message ?: "Could not save to Gallery")
                            }
                        }
                        notifyListeners("done", payload, true)
                    }
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
                if (jobId.matches(Regex("[A-Za-z0-9_-]+"))) {
                    File(context.cacheDir, "vcut-text/$jobId").deleteRecursively()
                }
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

    /** Gallery retry. Android 10+ uses scoped storage; older devices request legacy write access. */
    @PluginMethod
    fun saveToGallery(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("legacyGallery") != PermissionState.GRANTED) {
            requestPermissionForAlias("legacyGallery", call, "saveWithGalleryPermission")
            return
        }
        saveGallery(call)
    }

    @PermissionCallback
    private fun saveWithGalleryPermission(call: PluginCall) {
        saveGallery(call)
    }

    private fun saveGallery(call: PluginCall) {
        val path = call.getString("path") ?: return call.reject("Missing path")
        val fileName = call.getString("fileName") ?: return call.reject("Missing fileName")
        try {
            val result = JSObject()
            result.put("uri", copyToGallery(path, fileName))
            call.resolve(result)
        } catch (e: Exception) {
            call.reject(e.message ?: "Failed to save to gallery", e)
        }
    }

    private fun copyToGallery(path: String, fileName: String): String {
        val file = File(path)
        require(file.isFile && file.length() > 0) { "The exported video could not be found" }
        require(fileName.isNotBlank()) { "The exported video's filename is missing" }
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/VCut")
                put(MediaStore.Video.Media.IS_PENDING, 1)
            }
        }
        val itemUri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("Could not create a gallery entry")
        try {
            resolver.openOutputStream(itemUri).use { out ->
                checkNotNull(out) { "Could not open the gallery entry for writing" }
                file.inputStream().use { input -> input.copyTo(out) }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear()
                values.put(MediaStore.Video.Media.IS_PENDING, 0)
                check(resolver.update(itemUri, values, null, null) > 0) { "Could not publish the video to Gallery" }
            }

            return itemUri.toString()
        } catch (e: Exception) {
            resolver.delete(itemUri, null, null)
            throw e
        }
    }
}
