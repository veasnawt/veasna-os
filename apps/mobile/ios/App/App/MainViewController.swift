import Capacitor

// Capacitor's iOS "auto-registration" only scans npm plugin packages via the generated
// `capacitor.config.json` package-class list — it does NOT do an Objective-C runtime scan for
// CAPBridgedPlugin conformance. FfmpegPlugin.swift is a local file in this Xcode project, not an
// npm package, so it compiles and links fine but never actually gets into that list: without this,
// `Capacitor.isPluginAvailable("Ffmpeg")` stays false forever and the JS side reports "FFmpeg isn't
// available on this machine" even though the native plugin works. `registerPluginInstance(_:)` is
// the documented way to add a plugin that isn't discovered automatically — Main.storyboard's root
// view controller is repointed at this class (from the stock CAPBridgeViewController) specifically
// so this hook runs.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        (bridge as? CapacitorBridge)?.registerPluginInstance(FfmpegPlugin())
    }
}
