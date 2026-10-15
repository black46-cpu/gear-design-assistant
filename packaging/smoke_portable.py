"""Launch a built Windows bundle and verify UI plus STEP pair API."""
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dist_root = Path(os.environ.get("GEARDESIGN_DIST", root / "dist"))
if not dist_root.is_absolute():
    dist_root = root / dist_root
exe = dist_root / "GearDesign" / "GearDesign.exe"
if os.environ.get("GEARDESIGN_SMOKE_DEBUG") == "1":
    exe = root / "dist-debug" / "GearDesign" / "GearDesign.exe"
creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
if os.environ.get("GEARDESIGN_SMOKE_SOURCE") == "1":
    command = [str(root / ".venv" / "Scripts" / "python.exe"), str(root / "desktop_app.py")]
    cwd = root
else:
    command = [str(exe)]
    cwd = exe.parent
env = os.environ.copy()
env["LOCALAPPDATA"] = str(Path(tempfile.mkdtemp(prefix="GearDesign-smoke-")))
if os.environ.get("GEARDESIGN_SMOKE_SOURCE") != "1":
    internal = exe.parent / "_internal"
    env["PATH"] = os.pathsep.join([str(internal / "PySide6"), str(internal / "shiboken6"),
                                   str(internal), env.get("PATH", "")])
proc = subprocess.Popen(command, cwd=cwd, env=env, creationflags=creationflags)
log = Path(env["LOCALAPPDATA"]) / "GearDesign" / "launcher.log"
try:
    port = None
    for _ in range(120):
        if proc.poll() is not None:
            detail = log.read_text(errors="ignore") if log.exists() else "No launcher log was created."
            raise RuntimeError(f"EXE exited early with code {proc.returncode}:\n{detail[-3000:]}")
        if log.exists():
            matches = list(re.finditer(r"listening on 127\.0\.0\.1:(\d+)", log.read_text(errors="ignore"), re.I))
            if matches:
                port = int(matches[-1].group(1))
        if port:
            break
        time.sleep(0.5)
    if not port:
        detail = log.read_text(errors="ignore") if log.exists() else "No launcher log was created."
        raise RuntimeError(f"EXE did not open its loopback server:\n{detail[-3000:]}")
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=10) as response:
        html = response.read().decode("utf-8")
        assert response.status == 200 and "齿轮设计助手" in html and "animationToggle" in html
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/app.js", timeout=10) as response:
        app_js = response.read().decode("utf-8")
        assert "startAnimation" in app_js and "e.button!==0" in app_js and "auxclick" in app_js
    for path in ("/vendor/three.module.js", "/vendor/three.core.js"):
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=10) as response:
            assert response.status == 200 and len(response.read()) > 100_000
    cases = [
        {"type": "helical", "mode": "pair", "module": 2.5, "teeth": 24,
         "teeth2": 36, "pressure_angle": 20, "width": 20, "bore": 10,
         "bore2": 12, "profile_shift": 0, "helix_angle": 15, "hand": "right",
         "material": "45钢"},
        {"type": "rack", "mode": "pair", "module": 2.5, "teeth": 24,
         "pressure_angle": 20, "width": 10, "bore": 10, "profile_shift": 0,
         "helix_angle": 0, "hand": "right", "material": "45钢"},
        {"type": "bevel", "mode": "single", "module": 2.5, "teeth": 24,
         "pressure_angle": 20, "width": 8, "bore": 10, "profile_shift": 0,
         "helix_angle": 0, "hand": "right", "material": "45钢"},
    ]
    results = []
    for params in cases:
        data = json.dumps(params).encode("utf-8")
        request = urllib.request.Request(f"http://127.0.0.1:{port}/api/export-step",
                                         data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=180) as response:
            step = response.read()
            assert response.status == 200 and len(step) > 100_000 and b"ISO-10303-21" in step[:1000]
            results.append(len(step))
    assert not (Path(env["LOCALAPPDATA"]) / "GearDesign" / "output").exists()
    print(f"PASS: embedded UI and Three.js assets; helical/rack/bevel STEP {results}; no persistent app-data copy; port {port}")
finally:
    proc.terminate()
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        proc.kill()
