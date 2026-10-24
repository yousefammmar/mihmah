"""Optional local static server (Python stdlib only).

`python3 -m http.server` listens with a backlog of 5, so a cold load of ~20 ES modules can get
ERR_CONNECTION_RESET. This is the same server with a larger backlog and no-cache headers. Usage: python3 serve.py [port]
"""
import functools
import http.server
import os
import sys


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")  # always revalidate so edits show up on reload
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
root = os.path.dirname(os.path.abspath(__file__))
handler = functools.partial(Handler, directory=root)
print(f"Mihmah prototype: http://localhost:{port}/", flush=True)
Server(("127.0.0.1", port), handler).serve_forever()
