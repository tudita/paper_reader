#!/usr/bin/env python3
"""Serve a paper library on localhost and open its shared reader."""
from __future__ import annotations

import argparse
import functools
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class QuietHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, format, *args):
        return


def make_server(root: Path, preferred_port: int = 8765, attempts: int = 30):
    handler = functools.partial(QuietHandler, directory=str(root))
    ports = [0] if preferred_port == 0 else range(preferred_port, preferred_port + attempts)
    last_error = None
    for port in ports:
        try:
            return ThreadingHTTPServer(("127.0.0.1", port), handler)
        except OSError as error:
            last_error = error
    raise RuntimeError("No available localhost port") from last_error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    if not (root / "reader" / "index.html").is_file() or not (root / "library.json").is_file():
        raise FileNotFoundError(f"Not a paper library: {root}")
    server = make_server(root, args.port)
    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/reader/"
    print(f"Paper Reader: {url}")
    print("Keep this window open while reading. Press Ctrl+C to stop.")
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
