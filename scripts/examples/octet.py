# Octet Draw for a script (docs/scripting.md): starts Octet with no window and calls its tools. Nothing to install.
# The program is OCTET, or the path given. open and save read and write the files: Octet's tools take no path.
import base64, json, os, subprocess

BINARY = ["cdx", "pdf", "png", "emf", "eps", "tif", "jpg", "gif"]  # read gives these in base64

class Octet:
    def __init__(self, program=None):
        self.p = subprocess.Popen([program or os.environ["OCTET"], "--headless", "--mcp"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf-8")
        self.n = 0
        self.ask("initialize", {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "script", "version": "1"}})

    def ask(self, method, params):
        self.n += 1
        self.p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params}) + "\n")
        self.p.stdin.flush()
        for line in self.p.stdout:
            m = json.loads(line)
            if m.get("id") == self.n:
                return m
        return {"error": {"message": "Octet ended."}}

    def call(self, tool, args={}):
        m = self.ask("tools/call", {"name": tool, "arguments": args})
        if "error" in m or m["result"].get("isError"):
            raise RuntimeError(m["error"]["message"] if "error" in m else m["result"]["content"][0]["text"])
        return m["result"].get("structuredContent", m["result"]["content"][0]["text"])

    def open(self, path):
        data = open(path, "rb").read()
        return self.call("drawings", {"action": "new", "text": base64.b64encode(data).decode() if path.lower().endswith(".cdx") else data.decode("utf-8")})

    def save(self, path, format=None):
        format = format or path.rsplit(".", 1)[-1].lower()
        text = self.call("read", {"format": format})["text"]
        open(path, "wb").write(base64.b64decode(text) if format in BINARY else text.encode("utf-8"))

    def close(self):
        self.p.stdin.close()
        self.p.wait()
