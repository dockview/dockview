#!/usr/bin/env python3
"""
Drives a real drag of a tab from one native window into another and judges
it from the shell's own log. Needs an X display (Xvfb will do), xdotool, the
Vite dev server on port 1420 (start it with VITE_DND=html5: under Xvfb there
is no pointing device, WebKit reports a coarse pointer, and dockview's 'auto'
would pick the pointer backend, which cannot leave a window), and a debug
build of the shell. Example:

    Xvfb :99 -screen 0 2400x1000x24 &
    VITE_DND=html5 yarn dev &
    cargo build --manifest-path src-tauri/Cargo.toml
    DISPLAY=:99 python3 scripts/measure-cross-window-drag.py

The shell is started with DOCKVIEW_DEMO_AUTOTEST set, which opens a second
window at a known position and makes each window report its geometry and
the cross-window drag log as JSON lines on stdout. Those lines are the only
thing this script reads; it never looks at pixels. The workspace file is a
fresh temporary one unless --workspace names another, so a run never starts
from a previous run's layout; with --restart the shell is closed after the
drag and started again from that file, and the run passes only if both
windows come back with the tab where the drag left it.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from queue import Empty, Queue

MAIN_TITLE = "dockview + Tauri"
SECOND_TITLE = "dockview — dock-2"


def xdotool(*args):
    return subprocess.run(
        ["xdotool", *args], check=True, capture_output=True, text=True
    ).stdout


def window_origin(title):
    """Screen position of the window with exactly this title. Titles are
    matched in Python: xdotool's --name is a regex, and "+" would quantify."""
    for wid in xdotool("search", "--name", ".").split():
        try:
            name = xdotool("getwindowname", wid).strip()
        except subprocess.CalledProcessError:
            continue
        if name == title:
            shell = xdotool("getwindowgeometry", "--shell", wid)
            values = dict(line.split("=") for line in shell.split())
            return int(values["X"]), int(values["Y"])
    raise SystemExit(f"no window titled {title!r}")


def drag(src, dst, steps=24):
    """A pointer drag with enough intermediate motion to start an HTML5 drag."""
    sx, sy = src
    dx, dy = dst
    xdotool("mousemove", str(sx), str(sy))
    time.sleep(0.2)
    xdotool("mousedown", "1")
    time.sleep(0.2)
    for i in range(1, steps + 1):
        x = round(sx + (dx - sx) * i / steps)
        y = round(sy + (dy - sy) * i / steps)
        xdotool("mousemove", str(x), str(y))
        time.sleep(0.05)
    # Settle on the target so the drop overlay has resolved its position.
    for _ in range(4):
        xdotool("mousemove", str(dx), str(dy))
        time.sleep(0.1)
    xdotool("mouseup", "1")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--binary",
        default=os.path.join(
            os.path.dirname(__file__), "..", "src-tauri", "target", "debug",
            "dockview-tauri-demo",
        ),
    )
    parser.add_argument("--panel", default="scratch", help="tab to drag, in main")
    parser.add_argument("--target", default="host", help="panel to drop on, in dock-2")
    parser.add_argument(
        "--where",
        default="right",
        choices=["center", "left", "right", "top", "bottom", "tab", "detach"],
        help="where on the target's content to drop; 'tab' drops on the "
        "left half of the target's own tab, which lands before it; 'off' "
        "releases the drag outside every window with detach on, so the "
        "shell opens a new window holding the tab",
    )
    parser.add_argument("--screenshot", help="write a PNG of the screen after the drop")
    parser.add_argument("--timeout", type=float, default=40.0)
    parser.add_argument("--workspace", help="workspace file to use (default: a fresh temporary file)")
    parser.add_argument(
        "--restart",
        action="store_true",
        help="after the drag, close the shell and start it again from the workspace file",
    )
    parser.add_argument(
        "--undo",
        action="store_true",
        help="after the drag, undo it through the shell and check the tab is back, then redo",
    )
    args = parser.parse_args()

    workspace = args.workspace or os.path.join(
        tempfile.mkdtemp(prefix="dockview-workspace-"), "workspace.json"
    )
    env = dict(os.environ, DOCKVIEW_DEMO_AUTOTEST="1", DOCKVIEW_DEMO_WORKSPACE=workspace)
    print(f"workspace file: {workspace}")

    lines = Queue()
    rects = {}
    log = []
    deadline = time.monotonic() + args.timeout

    def launch():
        app = subprocess.Popen(
            [args.binary], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True,
        )

        def pump():
            for line in app.stdout:
                lines.put(line)

        threading.Thread(target=pump, daemon=True).start()
        return app

    def stop(app):
        app.terminate()
        try:
            app.wait(timeout=5)
        except subprocess.TimeoutExpired:
            app.kill()

    app = launch()

    nonlocal_deadline = [deadline]

    def take(until):
        """Consume report lines until `until()` holds or the deadline passes."""
        while not until():
            remaining = nonlocal_deadline[0] - time.monotonic()
            if remaining <= 0:
                return False
            try:
                line = lines.get(timeout=min(remaining, 0.5))
            except Empty:
                continue
            try:
                report = json.loads(line)
            except ValueError:
                continue
            if report["kind"] == "rects":
                rects[report["label"]] = report["payload"]
            elif report["kind"] == "log":
                log.append((report["label"], report["payload"]))
                print(f"  [{report['label']}] {report['payload']}")
        return True

    try:
        def find(label, name):
            """A panel id in `label`'s layout: exact, or suffixed with the
            window label as every window but main names its own panels."""
            panels = rects.get(label, {}).get("panels", {})
            for candidate in (name, f"{name}-{label}"):
                if candidate in panels:
                    return candidate
            return None

        ready = lambda: find("main", args.panel) and find("dock-2", args.target)
        if not take(ready):
            raise SystemExit("timed out waiting for both windows to report geometry")
        panel_id = find("main", args.panel)
        target_id = find("dock-2", args.target)

        for label in ("main", "dock-2"):
            dnd = rects[label]["dnd"]
            print(f"{label}: dnd html5={dnd['html5']} pointer={dnd['pointer']}")
            if not dnd["html5"]:
                raise SystemExit(f"{label} has no HTML5 drag backend; start vite with VITE_DND=html5")

        mx, my = window_origin(MAIN_TITLE)
        sx2, sy2 = window_origin(SECOND_TITLE)
        tab = rects["main"]["panels"][panel_id]["tab"]
        target = rects["dock-2"]["panels"][target_id]
        src = (mx + tab["x"] + tab["width"] // 2, my + tab["y"] + tab["height"] // 2)
        if args.where == "detach":
            # Detach is a checkbox in the window; the shell switches it on
            # for every window on this command and the windows say so.
            app.stdin.write("detach\n")
            app.stdin.flush()
            if not take(lambda: any(line == "detach on" for _, line in log)):
                raise SystemExit("timed out waiting for detach to switch on")
            box, fx, fy = {"x": 2300, "y": 950, "width": 0, "height": 0}, 0, 0
            sx2, sy2 = 0, 0
        elif args.where == "tab":
            box, fx, fy = target["tab"], 0.25, 0.5
        else:
            box = target["content"]
            fx, fy = {
                "center": (0.5, 0.5), "left": (0.08, 0.5), "right": (0.92, 0.5),
                "top": (0.5, 0.08), "bottom": (0.5, 0.92),
            }[args.where]
        dst = (
            sx2 + box["x"] + round(box["width"] * fx),
            sy2 + box["y"] + round(box["height"] * fy),
        )
        print(f"dragging {panel_id} tab at {src} to {target_id} ({args.where}) at {dst}")
        before = len(log)
        drag(src, dst)

        if args.where == "detach":
            placed = lambda: any(
                label.startswith("dock-detached-") and "started with detached" in line
                for label, line in log[before:]
            )
        else:
            placed = lambda: any(
                label == "dock-2" and " placed " in line for label, line in log[before:]
            )
        released = lambda: any(
            label == "main" and "released" in line for label, line in log[before:]
        )
        take(lambda: placed() and released())
        # Give the destination's layout a moment to report, for the summary.
        time.sleep(1.0)
        while True:
            try:
                line = lines.get_nowait()
            except Empty:
                break
            try:
                report = json.loads(line)
            except ValueError:
                continue
            if report["kind"] == "rects":
                rects[report["label"]] = report["payload"]

        if args.screenshot:
            subprocess.run(["import", "-window", "root", args.screenshot], check=False)

        ok = placed() and released()
        print()
        for label in sorted(rects):
            print(f"{label} panels:".ljust(15), sorted(rects[label]["panels"]))
        if args.where == "detach":
            detached = [label for label in rects if label.startswith("dock-detached-")]
            ok = ok and any(panel_id in rects[label]["panels"] for label in detached)
            ok = ok and panel_id not in rects["main"]["panels"]
            print("RESULT:", "the tab detached into a new window" if ok else "the tab did not detach")
            return 0 if ok else 1
        print("RESULT:", "the tab crossed windows" if ok else "the tab did not cross")
        if not ok:
            return 1

        if args.undo:
            # The shell reads "undo" and "redo" lines on stdin under the
            # harness flag; the windows report their geometry afterwards.
            holds = lambda label, panel: panel in rects.get(label, {}).get("panels", {})

            def drive(command, expect_main, expect_dock2, verdict):
                rects.clear()
                nonlocal_deadline[0] = time.monotonic() + args.timeout
                print()
                print(f"{command} through the shell")
                app.stdin.write(f"{command}\n")
                app.stdin.flush()
                settled = lambda: (
                    holds("main", panel_id) == expect_main
                    and holds("dock-2", panel_id) == expect_dock2
                    and rects.get("main", {}).get("panels")
                    and rects.get("dock-2", {}).get("panels")
                )
                done = take(settled)
                print("main panels:  ", sorted(rects.get("main", {}).get("panels", {})))
                print("dock-2 panels:", sorted(rects.get("dock-2", {}).get("panels", {})))
                print("RESULT:", verdict if done else f"{command} did not take effect")
                return done

            if not drive("undo", True, False, "undo brought the tab back"):
                return 1
            if not drive("redo", False, True, "redo moved the tab across again"):
                return 1

        if not args.restart:
            return 0

        # Let the shell's debounced save run, then close it the way the
        # user would and bring it back from the file alone.
        time.sleep(1.5)
        stop(app)
        before = {label: sorted(report["panels"]) for label, report in rects.items()}
        print()
        print("restarting the shell from the workspace file")
        rects.clear()
        app = launch()
        deadline = time.monotonic() + args.timeout
        # take() reads the deadline from the enclosing scope; rebind it.
        nonlocal_deadline[0] = deadline
        # A window reports geometry before its restore has finished, so wait
        # for panels, not merely for a report.
        restored = lambda: all(
            rects.get(label, {}).get("panels") for label in ("main", "dock-2")
        )
        if not take(restored):
            raise SystemExit("timed out waiting for both windows to come back")
        after = {label: sorted(rects[label]["panels"]) for label in ("main", "dock-2")}
        print("main panels:  ", after["main"])
        print("dock-2 panels:", after["dock-2"])
        same = after == {label: before[label] for label in ("main", "dock-2")}
        print("RESULT:", "both windows came back with their layouts" if same else "the layouts did not survive the restart")
        return 0 if same else 1
    finally:
        stop(app)


if __name__ == "__main__":
    sys.exit(main())
