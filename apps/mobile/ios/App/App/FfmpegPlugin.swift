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

    // FFmpeg callbacks run on worker queues; serialize job state and cancellation.
    private let jobs = DispatchQueue(label: "com.veasnawt.vcut.ffmpeg-jobs")
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
        let outputPath = call.getString("outputPath")
        let fileName = call.getString("fileName")
        jobs.async {
            if let outputPath = outputPath {
                do {
                    let folder = URL(fileURLWithPath: outputPath).deletingLastPathComponent().path
                    let attributes = try FileManager.default.attributesOfFileSystem(forPath: folder)
                    if let free = attributes[.systemFreeSize] as? NSNumber {
                        var bitrateKbps = 2000.0
                        if let index = args.firstIndex(of: "-b:v"), index + 1 < args.count {
                            let value = args[index + 1]
                            if value.hasSuffix("k"), let rate = Double(value.dropLast()) { bitrateKbps = rate }
                        }
                        let duration = max(call.getDouble("duration") ?? 0, 0)
                        // Allow AAC audio and MP4 overhead, with a minimum working reserve.
                        let required = max(8 * 1024 * 1024, duration * (bitrateKbps + 192) * 1000 / 8 * 1.2)
                        if free.doubleValue < required {
                            call.reject("There isn't enough free storage to export this video. Free up space and try again.")
                            return
                        }
                    }
                } catch {
                    call.reject("Couldn't access the export folder. Please try again.")
                    return
                }
            }
            self.totalDurationMs[jobId] = (call.getDouble("duration") ?? 0) * 1000

            let session = FFmpegKit.execute(
                withArgumentsAsync: args,
                withCompleteCallback: { [weak self] session in
                    guard let self = self, let session = session else { return }
                    self.jobs.async {
                        var payload: [String: Any] = ["jobId": jobId]
                        let returnCode = session.getReturnCode()
                        if ReturnCode.isSuccess(returnCode) {
                            // Audio extraction shares run(); only video exports carry an output path/name.
                            if let outputPath = outputPath, let fileName = fileName, !fileName.isEmpty {
                                payload["fileName"] = fileName
                                self.saveVideo(path: outputPath) { error in
                                    var finished = payload
                                    finished["gallerySaved"] = error == nil
                                    if let error = error { finished["galleryError"] = error }
                                    self.notifyListeners("done", data: finished, retainUntilConsumed: true)
                                }
                            } else { self.notifyListeners("done", data: payload, retainUntilConsumed: true) }
                        } else if ReturnCode.isCancel(returnCode) {
                            self.notifyListeners("cancelled", data: payload, retainUntilConsumed: true)
                        } else {
                            // Truncate by LINE, not character count — see FfmpegPlugin.kt's identical comment:
                            // a char-count cutoff can slice through the middle of the startup "configuration:"
                            // line (hundreds of chars, one line) and dump build-flag noise ahead of the real
                            // error instead of showing the actually-relevant tail.
                            let full = session.getFailStackTrace() ?? session.getAllLogsAsString() ?? "FFmpeg exited with a failure"
                            let tail = full.components(separatedBy: "\n").suffix(12).joined(separator: "\n")
                                .trimmingCharacters(in: .whitespacesAndNewlines)
                            payload["error"] = tail
                            self.notifyListeners("failed", data: payload, retainUntilConsumed: true)
                        }
                        self.sessionIds.removeValue(forKey: jobId)
                        self.totalDurationMs.removeValue(forKey: jobId)
                    }
                },
                withLogCallback: nil,
                withStatisticsCallback: { [weak self] statistics in
                    guard let self = self, let statistics = statistics else { return }
                    self.jobs.async {
                        let total = self.totalDurationMs[jobId] ?? 0
                        let fraction = total > 0 ? min(max(Double(statistics.getTime()) / total, 0), 1) : 0
                        self.notifyListeners("progress", data: ["jobId": jobId, "fraction": fraction])
                    }
                }
            )
            if let runningSession = session {
                // `Session`'s own header declares `getSessionId`, but the framework's Swift overlay marks
                // it `@available(swift, obsoleted: 3, renamed: "getId()")` — a leftover Swift 3 migration
                // shim. `getSessionId()` doesn't compile in Swift; `getId()` is the real entry point.
                self.sessionIds[jobId] = runningSession.getId()
            } else {
                self.totalDurationMs.removeValue(forKey: jobId)
                call.reject("Couldn't start FFmpeg")
                return
            }
            call.resolve()
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        guard let jobId = call.getString("jobId") else {
            call.reject("Missing jobId")
            return
        }
        jobs.async {
            if let sessionId = self.sessionIds[jobId] {
                FFmpegKit.cancel(sessionId)
            }
            call.resolve()
        }
    }

    private func saveVideo(path: String, completion: @escaping (String?) -> Void) {
        guard FileManager.default.fileExists(atPath: path) else { completion("The exported video is missing."); return }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else { completion("Photo library access was denied."); return }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: URL(fileURLWithPath: path))
            }) { success, error in
                completion(success ? nil : (error?.localizedDescription ?? "Failed to save to Photos"))
            }
        }
    }
    @objc func saveToGallery(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.reject("Missing path"); return }
        saveVideo(path: path) { error in
            if let error = error { call.reject(error) } else { call.resolve(["uri": URL(fileURLWithPath: path).absoluteString]) }
        }
    }
}
