// Mirrors `FfmpegPlugin.kt` (Android) — same methods, same `Ffmpeg` JS-side plugin name, talking
// to ffmpeg-kit's iOS SDK instead of its Android AAR. See the mobile-export plan's own note: this file
// is written for parity so `apps/mobile/ios` isn't left half-wired, but it has NOT been built or run —
// Xcode/the iOS simulator don't exist on this (Windows) dev machine, and this session has only ever
// built/tested the Android APK. Whoever next has Mac access needs to:
//   1. Add a working CocoaPods dependency to `apps/mobile/ios/App/Podfile`'s `target 'App' do` block for
//      an ffmpeg-kit-compatible iOS pod (the Android side uses `com.moizhassan.ffmpeg:ffmpeg-kit-16kb`,
//      which is Android/Maven-only — no confirmed iOS/CocoaPods equivalent from the same fork was
//      verified this session; research a maintained iOS-covering fork before assuming one exists).
//   2. Confirm the actual Swift/Objective-C API surface below against whatever pod is chosen — this is
//      reconstructed from ffmpeg-kit's historical (pre-retirement) API shape, not verified against a
//      real compile.
//   3. Run `pod install`, build, and smoke-test on a real device the same way the Android build order
//      does (see the plan: trivial export first, then the full filter-graph path).

import Capacitor
import Foundation
import Photos

@objc(FfmpegPlugin)
public class FfmpegPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FfmpegPlugin"
    public let jsName = "Ffmpeg"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "run", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToGallery", returnType: CAPPluginReturnPromise),
    ]

    private var sessionIds: [String: Int32] = [:]
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

        let session = FFmpegKit.executeAsync(
            withArguments: args,
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
        if let session = session {
            sessionIds[jobId] = session.getSessionId()
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
