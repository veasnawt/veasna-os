// Mirrors `FfmpegPlugin.kt` (Android) — same methods, same `Ffmpeg` JS-side plugin name, talking
// to ffmpeg-kit's iOS SDK (via the `ffmpeg-kit-lgpl` pod in ../Podfile) instead of its Android AAR.
// The API surface below was checked against that pod's bundled Objective-C headers (FFmpegKit.h,
// Session.h, Statistics.h, ReturnCode.h) and against the real compiler: the Obj-C selector
// `executeWithArgumentsAsync:withCompleteCallback:withLogCallback:withStatisticsCallback:` is imported
// into Swift as `FFmpegKit.execute(withArgumentsAsync:withCompleteCallback:withLogCallback:
// withStatisticsCallback:)` — Swift's importer factors the "WithArguments" piece into the first
// parameter label rather than keeping it as part of the base method name.

import Capacitor
import Foundation
import Photos
import ffmpegkit

@objc(FfmpegPlugin)
public class FfmpegPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FfmpegPlugin"
    public let jsName = "Ffmpeg"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "run", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToGallery", returnType: CAPPluginReturnPromise),
    ]

    private var sessionIds: [String: Int] = [:]
    private var totalDurationMs: [String: Double] = [:]

    @objc func run(_ call: CAPPluginCall) {
        guard let jobId = call.getString("jobId") else {
            call.reject("Missing jobId")
            return
        }
        guard let args = call.getArray("args", String.self) else {
            call.reject("Missing args")
            return
        }
        totalDurationMs[jobId] = (call.getDouble("duration") ?? 0) * 1000

        let session = FFmpegKit.execute(
            withArgumentsAsync: args,
            withCompleteCallback: { [weak self] session in
                guard let self = self, let session = session else { return }
                var payload: [String: Any] = ["jobId": jobId]
                let returnCode = session.getReturnCode()
                if ReturnCode.isSuccess(returnCode) {
                    self.notifyListeners("done", data: payload)
                } else if ReturnCode.isCancel(returnCode) {
                    self.notifyListeners("cancelled", data: payload)
                } else {
                    // Truncate by LINE, not character count — see FfmpegPlugin.kt's identical comment:
                    // a char-count cutoff can slice through the middle of the startup "configuration:"
                    // line (hundreds of chars, one line) and dump build-flag noise ahead of the real
                    // error instead of showing the actually-relevant tail.
                    let full = session.getFailStackTrace() ?? session.getAllLogsAsString() ?? "FFmpeg exited with a failure"
                    let tail = full.components(separatedBy: "\n").suffix(12).joined(separator: "\n")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    payload["error"] = tail
                    self.notifyListeners("failed", data: payload)
                }
                self.sessionIds.removeValue(forKey: jobId)
                self.totalDurationMs.removeValue(forKey: jobId)
            },
            withLogCallback: nil,
            withStatisticsCallback: { [weak self] statistics in
                guard let self = self, let statistics = statistics else { return }
                let total = self.totalDurationMs[jobId] ?? 0
                let fraction = total > 0 ? min(max(Double(statistics.getTime()) / total, 0), 1) : 0
                self.notifyListeners("progress", data: ["jobId": jobId, "fraction": fraction])
            }
        )
        if let runningSession = session {
            // `Session`'s own header declares `getSessionId`, but the framework's Swift overlay marks
            // it `@available(swift, obsoleted: 3, renamed: "getId()")` — a leftover Swift 3 migration
            // shim. `getSessionId()` doesn't compile in Swift; `getId()` is the real entry point.
            sessionIds[jobId] = runningSession.getId()
        }
        call.resolve()
    }

    @objc func cancel(_ call: CAPPluginCall) {
        guard let jobId = call.getString("jobId") else {
            call.reject("Missing jobId")
            return
        }
        if let sessionId = sessionIds[jobId] {
            FFmpegKit.cancel(sessionId)
        }
        call.resolve()
    }

    // Mirrors FfmpegPlugin.kt's `saveToGallery` — same Info.plist `NSPhotoLibraryAddUsageDescription`
    // key this needs is NOT yet added (see the file-level unverified-on-Windows note); add it before
    // testing on a Mac or this will crash the first time a save is attempted, not merely fail cleanly.
    @objc func saveToGallery(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("Missing path")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Photo library access was denied")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: URL(fileURLWithPath: path))
            }) { success, error in
                if success {
                    call.resolve()
                } else {
                    call.reject(error?.localizedDescription ?? "Failed to save to Photos")
                }
            }
        }
    }
}
