#!/usr/bin/env python3

import argparse
import base64
import errno
import fcntl
import json
import os
import pty
import selectors
import signal
import struct
import subprocess
import sys
import termios


def send_message(message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def set_window_size(fd, rows, cols):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def terminate_process_group(pid, sig):
    try:
        os.killpg(pid, sig)
    except (ProcessLookupError, PermissionError):
        pass
    except OSError as error:
        if error.errno != errno.EPERM:
            raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", required=True)
    parser.add_argument("--cols", required=True, type=int)
    parser.add_argument("--rows", required=True, type=int)
    parser.add_argument("--entrypoint", required=True)
    args = parser.parse_args()

    master_fd, slave_fd = pty.openpty()
    set_window_size(slave_fd, args.rows, args.cols)

    child = subprocess.Popen(
        ["bun", "run", args.entrypoint],
        cwd=args.cwd,
        env=os.environ.copy(),
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        start_new_session=True,
        close_fds=True,
    )

    os.close(slave_fd)

    selector = selectors.DefaultSelector()
    stdin_fd = sys.stdin.fileno()
    os.set_blocking(master_fd, False)
    os.set_blocking(stdin_fd, False)
    selector.register(master_fd, selectors.EVENT_READ, "pty")
    selector.register(stdin_fd, selectors.EVENT_READ, "stdin")

    stdin_buffer = b""
    pty_open = True

    send_message({"type": "started"})

    try:
        while True:
            for key, _ in selector.select(0.05):
                if key.data == "pty":
                    try:
                        chunk = os.read(master_fd, 4096)
                    except OSError as error:
                        if error.errno == errno.EIO:
                            chunk = b""
                        else:
                            raise

                    if chunk:
                        send_message({
                            "type": "output",
                            "data": base64.b64encode(chunk).decode("ascii"),
                        })
                    elif pty_open:
                        pty_open = False
                        selector.unregister(master_fd)
                else:
                    chunk = os.read(stdin_fd, 4096)
                    if not chunk:
                        selector.unregister(stdin_fd)
                        continue

                    stdin_buffer += chunk
                    while b"\n" in stdin_buffer:
                        raw_line, stdin_buffer = stdin_buffer.split(b"\n", 1)
                        if not raw_line.strip():
                            continue

                        command = json.loads(raw_line.decode("utf8"))
                        if command["type"] == "write":
                            os.write(master_fd, base64.b64decode(command["data"]))
                        elif command["type"] == "resize":
                            set_window_size(master_fd, command["rows"], command["cols"])
                            terminate_process_group(child.pid, signal.SIGWINCH)
                        elif command["type"] == "stop":
                            terminate_process_group(child.pid, signal.SIGTERM)

            exit_code = child.poll()
            if exit_code is not None and not pty_open:
                send_message({"type": "exit", "code": exit_code})
                break
    finally:
        terminate_process_group(child.pid, signal.SIGTERM)
        try:
            selector.close()
        finally:
            try:
                os.close(master_fd)
            except OSError:
                pass


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        send_message({"type": "error", "message": str(error)})
        raise
