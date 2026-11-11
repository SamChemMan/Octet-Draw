# Octet Draw for a script (docs/scripting.md): starts Octet with no window and calls its tools. Nothing to install.
# The program is OCTET, or the path given. open and save read and write the files: Octet's tools take no path.
import base64, json, os
from subprocess import PIPE, Popen

BINARY = ["cdx", "pdf", "png", "emf", "eps", "tif", "jpg", "gif"]  # read gives these in base64

class Octet:
    def __init__(self, program=None):
        command = [program or os.environ["OCTET"], "--headless", "--mcp"]
        self.p, self.n = Popen(command, stdin=PIPE, stdout=PIPE, encoding="utf-8", bufsize=1), 0
        self.send("initialize", {"protocolVersion": "2025-11-25", "capabilities": {},
                                 "clientInfo": {"name": "script", "version": "1"}})
    def send(self, method, params):  # one request a line; the reply's result, or Octet's reason as an error
        self.n += 1
        self.p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params}) + "\n")
        replies = (m for m in map(json.loads, self.p.stdout) if m.get("id") == self.n)
        m = next(replies, {"error": {"message": "Octet ended."}})
        if "error" in m: raise RuntimeError(m["error"]["message"])
        if m["result"].get("isError"): raise RuntimeError(m["result"]["content"][0]["text"])
        return m["result"]
    def call(self, tool, args={}):
        result = self.send("tools/call", {"name": tool, "arguments": args})
        return result.get("structuredContent", result["content"][0]["text"])
    def open(self, path):
        data = open(path, "rb").read()
        text = base64.b64encode(data).decode() if path.lower().endswith(".cdx") else data.decode("utf-8")
        return self.call("drawings", {"action": "new", "text": text})
    def save(self, path, format=None):
        format = format or path.rsplit(".", 1)[-1].lower()
        text = self.call("read", {"format": format})["text"]
        open(path, "wb").write(base64.b64decode(text) if format in BINARY else text.encode("utf-8"))
    def close(self):
        self.p.stdin.close()
        self.p.wait()
