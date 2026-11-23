// Loads a page in a WKWebView (the engine the Mac app runs in), runs a script in it and prints what the script
// returns. scripts/look.mjs runs it: swift scripts/look/webkit.swift <url> <script.js> [seconds]. The window is on screen but
// clear and takes no clicks, so the page lays out and animates as it does in the app.
import WebKit
import AppKit

let args = CommandLine.arguments
guard args.count >= 3, let url = URL(string: args[1]), let js = try? String(contentsOfFile: args[2], encoding: .utf8) else {
  print("usage: swift webkit.swift <url> <script.js>"); exit(64)
}

final class Nav: NSObject, WKNavigationDelegate {
  let done: () -> Void
  init(_ done: @escaping () -> Void) { self.done = done }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) { done() }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { print("LOAD ERROR \(e.localizedDescription)"); exit(3) }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { print("LOAD ERROR \(e.localizedDescription)"); exit(3) }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let config = WKWebViewConfiguration()
// What the page writes with console.error: lines that start "look:" (src/lookwatch.ts) apart from every other error.
config.userContentController.addUserScript(WKUserScript(source: """
  window.__look = []; window.__errors = [];
  (() => {
    const error = console.error;
    console.error = (...a) => { const t = a.map(String).join(" "); (t.startsWith("look:") ? window.__look : window.__errors).push(t.slice(0, 300)); error(...a); };
    addEventListener("error", (e) => window.__errors.push("uncaught: " + e.message));
  })();
  """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
// 1440 x 900, or another height from LOOK_HEIGHT (a small laptop or a tablet: 768).
let size = NSRect(x: 0, y: 0, width: 1440, height: Double(ProcessInfo.processInfo.environment["LOOK_HEIGHT"] ?? "") ?? 900)
let web = WKWebView(frame: size, configuration: config)
let window = NSWindow(contentRect: size, styleMask: [.borderless], backing: .buffered, defer: false)
window.contentView = web
window.alphaValue = 0.01
window.ignoresMouseEvents = true
window.orderBack(nil)
var nav: Nav!
nav = Nav {
  web.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
    switch result {
    case .success(let value): print(value as? String ?? String(describing: value)); exit(0)
    case .failure(let error): print("SCRIPT ERROR \(error.localizedDescription)"); exit(4)
    }
  }
}
web.navigationDelegate = nav
web.load(URLRequest(url: url))
// The run stops after 180 s, or after the seconds given as a third argument.
let limit = args.count >= 4 ? Double(args[3]) ?? 180 : 180
// A script that keeps its result on window.__partial (touch.js) still reports what it reached.
DispatchQueue.main.asyncAfter(deadline: .now() + limit) {
  web.evaluateJavaScript("window.__partial ? JSON.stringify({ ...window.__partial, timeout: true, look: window.__look, errors: window.__errors }) : ''") { value, _ in
    print("TIMEOUT"); if let v = value as? String, !v.isEmpty { print(v) }; exit(2)
  }
}
app.run()
