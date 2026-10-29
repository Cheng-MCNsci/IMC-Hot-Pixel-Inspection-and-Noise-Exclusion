"""Serve this tutorial locally using only the Python standard library."""
import argparse
import functools
import http.server
import threading
import webbrowser
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port',type=int,default=8788)
parser.add_argument('--no-browser',action='store_true')
args=parser.parse_args()
root=Path(__file__).resolve().parent

class TutorialHandler(http.server.SimpleHTTPRequestHandler):
    """Keep editable pages and their code in sync across browser refreshes."""

    def end_headers(self):
        # This is a local preview server. Browser storage for reviews is separate
        # from the HTTP cache and is not affected by this response header.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        # Previously cached responses may send conditional requests. Serve the
        # current file instead of renewing a stale browser-cache entry.
        for header in ('If-Modified-Since', 'If-None-Match'):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

handler=functools.partial(TutorialHandler,directory=str(root))
try:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),handler)
except OSError as error:
    parser.exit(2,f'Could not open port {args.port}: {error}. Try --port 8789.\n')
url=f'http://127.0.0.1:{server.server_port}/'
print(f'Open {url}\nKeep this terminal open. Press Ctrl+C to stop. No data is uploaded.',flush=True)
if not args.no_browser:
    threading.Timer(.4,lambda:webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
