import Capacitor
import UIKit

@objc(AuthCallbackPlugin)
public class AuthCallbackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthCallbackPlugin"
    public let jsName = "AuthCallback"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise)]
    private static weak var instance: AuthCallbackPlugin?
    private static var pendingURL: URL?
    public override func load() {
        Self.instance = self
        if let url = Self.pendingURL { Self.pendingURL = nil; deliver(url) }
    }
    static func handle(_ url: URL) -> Bool {
        guard url.scheme == "vcut", url.host == "auth-callback" else { return false }
        if let plugin = instance { plugin.deliver(url) } else { pendingURL = url }
        return true
    }
    private func deliver(_ url: URL) {
        notifyListeners("authCallback", data: ["url": url.absoluteString], retainUntilConsumed: true)
    }
    @objc func openUrl(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https", url.host == "vcut.io" else { call.reject("Unsupported sign-in URL"); return }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() } else { call.reject("Couldn't open sign-in.") }
            }
        }
    }
}
