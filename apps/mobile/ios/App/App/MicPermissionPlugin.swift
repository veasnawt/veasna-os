// Fills a gap in Capacitor's OWN iOS WKUIDelegate: `WebViewDelegationHandler.swift`'s
// `requestMediaCapturePermissionFor` always calls `decisionHandler(.grant)` unconditionally at the app
// layer, so there is no control point before WebKit hits the real OS-level microphone permission — and
// iOS never re-shows that OS dialog once a user has denied it once. `useVoiceRecording.ts`'s
// `getUserMedia` just keeps rejecting with `NotAllowedError`, forever, with no way for the user to know
// why or how to recover, since neither `AppDelegate.swift` nor `MainViewController.swift` has any
// microphone-permission code at all. Unlike Android's equivalent plugin, `AVCaptureDevice`'s own
// `authorizationStatus` is always authoritative — no bookkeeping needed to distinguish "never asked"
// from "denied", the actual bug that broke Android's first attempt at this (see its own doc comment).
// `request()` still exists as its own method (not just `check()`) so both platforms share the exact
// same JS-side call shape (`useVoiceRecording.ts` calls `request()`, not `check()`, right before trying
// to record) — and so the OS dialog fires at a moment the app controls explicitly, same as Android,
// rather than implicitly whenever WebKit's own internal `getUserMedia` handling happens to trigger it.
import Capacitor
import AVFoundation
import UIKit

@objc(MicPermissionPlugin)
public class MicPermissionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MicPermissionPlugin"
    public let jsName = "MicPermission"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    @objc func check(_ call: CAPPluginCall) {
        call.resolve(stateResult())
    }

    @objc func request(_ call: CAPPluginCall) {
        if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                DispatchQueue.main.async {
                    call.resolve(self.stateResult())
                }
            }
        } else {
            call.resolve(stateResult())
        }
    }

    private func stateResult() -> [String: Any] {
        let state: String
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            state = "granted"
        case .denied, .restricted:
            state = "blocked"
        case .notDetermined:
            fallthrough
        @unknown default:
            state = "prompt"
        }
        return ["state": state]
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Couldn't build the Settings URL")
                return
            }
            UIApplication.shared.open(url, options: [:]) { _ in call.resolve() }
        }
    }
}
