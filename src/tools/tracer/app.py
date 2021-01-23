from flask import Flask
from flask import request
from flask import Response
import json
import urllib.parse as urlparse
import threading
import time
from urllib.parse import urlparse
from urllib.parse import parse_qs

events = []
active = False

lock = threading.Lock()

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class MyRequestHandler(SimpleHTTPRequestHandler):
    def end_headers (self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST')
        self.send_header('Access-Control-Max-Age', '86400')
        SimpleHTTPRequestHandler.end_headers(self)

    def do_GET(self):
        global lock
        global events
        global active
        if self.path == '/ping':
            lock.acquire()
            if active:
                self.send_response(501)
            else:
                self.send_response(200)
            lock.release()
            self.end_headers()

        if self.path == '/':
            lock.acquire()
            events = []
            active = True
            lock.release()

            time.sleep(10)

            lock.acquire()
            active = False
            copy = events
            lock.release()

            self.send_response(200)
            self.send_header('Content-Type', 'text/text')
            self.end_headers()

            self.wfile.write(bytes(json.dumps(copy), 'utf-8'))

    def do_POST(self):
        if '/collect' in self.path:
            global lock
            global events
            global active

            parsed_path = urlparse(self.path)
            instrument = parse_qs(parsed_path.query)['instrument'][0]
            print(instrument)
            data_string = self.rfile.read(int(self.headers['Content-Length']))
            print(int(self.headers['Content-Length']))
            parsed = json.loads(data_string)

            lock.acquire()
            if active:
                events.extend(parsed)
            lock.release()

            self.send_response(200)
            self.end_headers()

def run(server_class=ThreadingHTTPServer, handler_class=MyRequestHandler):
    server_address = ('127.0.0.1', 5000)
    httpd = server_class(server_address, handler_class)
    httpd.serve_forever()


if __name__ == "__main__":
    run()
