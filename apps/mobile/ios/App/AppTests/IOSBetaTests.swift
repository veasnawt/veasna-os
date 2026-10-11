import XCTest
import Capacitor
import WebKit
import AVFoundation

/// Exercises the shipped web bundle through WKWebView and the real native bridge.
@MainActor
final class IOSBetaTests: XCTestCase {
    private var webView: WKWebView!

    override func setUp() async throws {
        let root = UIApplication.shared.windows.first(where: { $0.isKeyWindow })?.rootViewController
        func findBridge(_ controller: UIViewController?) -> CAPBridgeViewController? {
            if let bridge = controller as? CAPBridgeViewController { return bridge }
            for child in controller?.children ?? [] {
                if let bridge = findBridge(child) { return bridge }
            }
            return nil
        }
        webView = try XCTUnwrap(findBridge(root)?.webView)
        try await waitFor("document.querySelector('#root')?.textContent.length > 20")
    }

    private func js(_ body: String, arguments: [String: Any] = [:]) async throws -> Any {
        try await webView.callAsyncJavaScript(body, arguments: arguments, in: nil, contentWorld: .page)
    }

    private func waitFor(_ expression: String, timeout: Double = 15) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if try await js("return Boolean(\(expression));") as? Bool == true { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail("Timed out waiting for \(expression)")
        throw NSError(domain: "IOSBetaTests", code: 1)
    }

    func testNativePluginsAndMicrophonePermission() async throws {
        let plugins = try await js("return ['Ffmpeg', 'AuthCallback', 'MicPermission', 'Filesystem', 'Camera', 'Share'].filter(name => !Capacitor.isPluginAvailable(name));") as? [String]
        XCTAssertEqual(plugins, [])
        let permission = try await js("return (await Capacitor.nativePromise('MicPermission', 'check', {})).state;") as? String
        XCTAssertTrue(["prompt", "granted", "blocked"].contains(permission ?? ""))
    }

    func testNativeLibraryImportPersistenceAndDeletion() async throws {
        let fixture = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "NativeLibraries", withExtension: "js"))
        let source = try String(contentsOf: fixture, encoding: .utf8)
        let checks = try await js(source + "\nreturn await IOSLibraryTests.run();") as? [String]
        XCTAssertEqual(checks?.count, 5)
    }

    func testEmailSignInForIosBeta() async throws {
        _ = try await js("document.querySelector('[aria-label=\"Back to projects\"]')?.click(); return true;")
        try await waitFor("document.querySelector('nav[aria-label=\"Primary\"]')")
        _ = try await js("[...document.querySelectorAll('nav[aria-label=\"Primary\"] button')].find(b => b.textContent.trim() === 'Me').click(); return true;")
        try await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Sign in')")
        _ = try await js("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Sign in').click(); return true;")
        try await waitFor("document.querySelector('input[type=email]')")
        let text = try await js("return document.body.textContent;") as! String
        XCTAssertTrue(text.contains("Send code"))
        XCTAssertFalse(text.contains("Continue with Google"))
        _ = try await js("document.querySelector('[aria-label=\"Close\"]').click(); [...document.querySelectorAll('nav[aria-label=\"Primary\"] button')].find(b => b.textContent.trim() === 'Home').click(); return true;")
    }

    func testCreateProjectOpenEditorAndPersist() async throws {
        // Start from home even when another test previously opened the editor.
        _ = try await js("document.querySelector('[aria-label=\"Back to projects\"]')?.click(); return true;")
        try await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('New project'))")
        _ = try await js("[...document.querySelectorAll('button')].find(b => b.textContent.includes('New project')).click(); return true;")
        try await waitFor("document.querySelector('[aria-label=\"New project\"]')")
        _ = try await js("[...document.querySelectorAll('button')].find(b => b.textContent === 'Create project').click(); return true;")
        try await waitFor("document.querySelector('[aria-label=\"Back to projects\"]') && document.querySelector('canvas')")
        let project = try await js("""
            const { files } = await Capacitor.nativePromise('Filesystem', 'readdir', {path: 'vcut-projects', directory: 'DATA'});
            for (const file of files) {
                if (file.name.startsWith('_')) continue;
                try {
                    const result = await Capacitor.nativePromise('Filesystem', 'readFile', {path: `vcut-projects/${file.name}/project.json`, directory: 'DATA', encoding: 'utf8'});
                    const project = JSON.parse(result.data);
                    if (project.name === 'Untitled') return project;
                } catch {}
            }
            throw new Error('Created project was not persisted');
            """) as? [String: Any]
        XCTAssertEqual(project?["name"] as? String, "Untitled")
        XCTAssertNotNil(project?["sequence"])
        _ = try await js("document.querySelector('[aria-label=\"Back to projects\"]').click(); return true;")
    }

    private func runFFmpeg(_ args: [String], cancel: Bool = false) async throws -> [String: Any] {
        try await js("""
            const jobId = 'ios-test-' + crypto.randomUUID();
            const handles = [];
            const result = new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('FFmpeg completion timed out')), 15000);
                for (const event of ['done', 'failed', 'cancelled']) {
                    handles.push(Capacitor.addListener('Ffmpeg', event, data => {
                        if (data.jobId !== jobId) return;
                        clearTimeout(timer);
                        resolve({event, ...data});
                    }));
                }
            });
            try {
                await Capacitor.nativePromise('Ffmpeg', 'run', {jobId, args, duration: 1});
                if (cancel) await Capacitor.nativePromise('Ffmpeg', 'cancel', {jobId});
                return await result;
            } finally { for (const handle of handles) (await handle).remove(); }
            """, arguments: ["args": args, "cancel": cancel]) as! [String: Any]
    }

    func testFFmpegAudioExtractionAndFailureAndCancellation() async throws {
        let path = "ios-beta-test-\(UUID().uuidString).mp3"
        let uri = try await js("return (await Capacitor.nativePromise('Filesystem', 'getUri', {path, directory: 'CACHE'})).uri;", arguments: ["path": path]) as! String
        let result = try await runFFmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libmp3lame", String(uri.dropFirst("file://".count))])
        XCTAssertEqual(result["event"] as? String, "done", String(describing: result))
        let size = try await js("return (await Capacitor.nativePromise('Filesystem', 'stat', {path, directory: 'CACHE'})).size;", arguments: ["path": path]) as? Int
        XCTAssertGreaterThan(size ?? 0, 1000)
        _ = try await js("return await Capacitor.nativePromise('Filesystem', 'deleteFile', {path, directory: 'CACHE'});", arguments: ["path": path])
        let failed = try await runFFmpeg(["-vcut-invalid-argument"])
        XCTAssertEqual(failed["event"] as? String, "failed")
        XCTAssertFalse((failed["error"] as? String ?? "").isEmpty)
        let cancelled = try await runFFmpeg(["-re", "-f", "lavfi", "-i", "sine=duration=600", "-f", "null", "-"], cancel: true)
        XCTAssertEqual(cancelled["event"] as? String, "cancelled", String(describing: cancelled))
    }

    func testFFmpegCompletionBeforeListenerRegistration() async throws {
        let event = try await js("""
            const jobId = 'ios-late-listener-' + crypto.randomUUID();
            await Capacitor.nativePromise('Ffmpeg', 'run', {jobId, args: ['-vcut-invalid-argument'], duration: 1});
            await new Promise(resolve => setTimeout(resolve, 150));
            let handle;
            const result = new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Completion was lost before listener registration')), 3000);
                handle = Capacitor.addListener('Ffmpeg', 'failed', data => {
                    if (data.jobId !== jobId) return;
                    clearTimeout(timer); resolve(data);
                });
            });
            try { return await result; } finally { (await handle).remove(); }
            """) as? [String: Any]
        XCTAssertFalse((event?["error"] as? String ?? "").isEmpty)
    }

    func testFFmpegInsufficientExportStorage() async throws {
        let message = try await js("""
            const {uri} = await Capacitor.nativePromise('Filesystem', 'getUri', {path: 'ios-space-test.mp4', directory: 'CACHE'});
            try {
                await Capacitor.nativePromise('Ffmpeg', 'run', {jobId: 'ios-space-test', args: ['-b:v', '999999999999k'], duration: 60, outputPath: uri.replace(/^file:\\/\\//, ''), fileName: 'test.mp4'});
                throw new Error('An export larger than available storage was accepted');
            } catch (error) { return error.message; }
            """) as? String
        XCTAssertTrue(message?.contains("enough free storage") == true, message ?? "Missing error")
    }

    func testVideoToolboxExportAndWebKitPlayback() async throws {
        let path = "ios-beta-video-\(UUID().uuidString).mp4"
        let uri = try await js("return (await Capacitor.nativePromise('Filesystem', 'getUri', {path, directory: 'CACHE'})).uri;", arguments: ["path": path]) as! String
        let result = try await runFFmpeg(["-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=1", "-f", "lavfi", "-i", "sine=duration=1", "-c:v", "h264_videotoolbox", "-allow_sw", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "-shortest", String(uri.dropFirst("file://".count))])
        XCTAssertEqual(result["event"] as? String, "done", String(describing: result))
        let asset = AVURLAsset(url: URL(string: uri)!)
        let duration = try await asset.load(.duration)
        XCTAssertEqual(duration.seconds, 1, accuracy: 0.1)
        let video = try await asset.loadTracks(withMediaType: .video)
        XCTAssertEqual(video.count, 1)
        let size = try await video.first?.load(.naturalSize)
        XCTAssertEqual(size?.width, 320)
        XCTAssertEqual(size?.height, 180)
        let dimensions = try await js("""
            const video = document.createElement('video');
            video.muted = true; video.playsInline = true;
            const ready = new Promise((resolve, reject) => {
                video.onloadedmetadata = () => resolve([video.videoWidth, video.videoHeight]);
                video.onerror = () => reject(new Error('WebKit could not decode the exported MP4'));
            });
            video.src = Capacitor.convertFileSrc(uri);
            return await ready;
            """, arguments: ["uri": uri]) as? [Int]
        XCTAssertEqual(dimensions, [320, 180])
        _ = try await js("return await Capacitor.nativePromise('Filesystem', 'deleteFile', {path, directory: 'CACHE'});", arguments: ["path": path])
    }

    func testEditorStyledTextExportWithPhotosDenied() async throws {
        let fixture = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "StyledTextProject", withExtension: "json"))
        let project = try String(contentsOf: fixture, encoding: .utf8)
        _ = try await js("""
            const fresh = JSON.parse(project); fresh.updatedAt = Date.now();
            await Capacitor.nativePromise('Filesystem', 'writeFile', {path: 'vcut-projects/ios-beta-export/project.json', directory: 'DATA', encoding: 'utf8', data: JSON.stringify(fresh), recursive: true});
            return true;
            """, arguments: ["project": project])
        webView.reload()
        while webView.isLoading { try await Task.sleep(nanoseconds: 100_000_000) }
        try await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('iOS Beta Export'))")
        _ = try await js("[...document.querySelectorAll('button')].find(b => b.textContent.includes('iOS Beta Export')).click(); return true;")
        try await waitFor("document.querySelector('[aria-label=\"Back to projects\"]') && document.querySelector('canvas')")
        _ = try await js("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export').click(); return true;")
        try await waitFor("document.querySelector('[aria-label=\"Export video\"]')")
        try await waitFor("[...document.querySelectorAll('[aria-label=\"Export video\"] button')].some(b => b.textContent.trim() === 'Export' && !b.disabled)")
        _ = try await js("[...document.querySelectorAll('[aria-label=\"Export video\"] button')].find(b => b.textContent.trim() === 'Export').click(); return true;")
        try await waitFor("document.querySelector('[aria-label=\"Export video\"]').textContent.includes('Export complete') || document.querySelector('[aria-label=\"Export video\"]').textContent.includes('Export failed')", timeout: 45)
        let message = try await js("return document.querySelector('[aria-label=\"Export video\"]').textContent;") as! String
        guard message.contains("Export complete") else {
            XCTFail(message)
            throw NSError(domain: "IOSBetaTests.Export", code: 1)
        }
        let uri = try await js("""
            const path = 'vcut-projects/ios-beta-export/exports';
            const {files} = await Capacitor.nativePromise('Filesystem', 'readdir', {path, directory: 'DATA'});
            const file = files.filter(f => f.name.endsWith('.mp4')).sort((a,b) => b.name.localeCompare(a.name))[0];
            return (await Capacitor.nativePromise('Filesystem', 'getUri', {path: `${path}/${file.name}`, directory: 'DATA'})).uri;
            """) as! String
        let asset = AVURLAsset(url: URL(string: uri)!)
        let duration = try await asset.load(.duration)
        XCTAssertEqual(duration.seconds, 2, accuracy: 0.1)
        let frame = try AVAssetImageGenerator(asset: asset).copyCGImage(at: CMTime(seconds: 1, preferredTimescale: 30), actualTime: nil)
        XCTAssertEqual(frame.width, 320)
        XCTAssertEqual(frame.height, 180)
        // A successful encode alone would miss a blank or missing text overlay.
        let pixels = try XCTUnwrap(frame.dataProvider?.data) as Data
        var brightPixels = 0
        pixels.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) in
            for row in 0..<frame.height {
                for col in 0..<frame.width {
                    let offset = row * frame.bytesPerRow + col * frame.bitsPerPixel / 8
                    if bytes[offset] > 180 && bytes[offset + 1] > 180 && bytes[offset + 2] > 180 { brightPixels += 1 }
                }
            }
        }
        XCTAssertGreaterThan(brightPixels, 50, "The styled text overlay is missing")
        let attachment = XCTAttachment(image: UIImage(cgImage: frame))
        attachment.name = "Native styled Khmer text export"
        attachment.lifetime = .keepAlways
        add(attachment)
        _ = try await js("[...document.querySelectorAll('[aria-label=\"Export video\"] button')].find(b => b.textContent.trim() === 'Close').click(); document.querySelector('[aria-label=\"Back to projects\"]').click(); return true;")
    }
}
