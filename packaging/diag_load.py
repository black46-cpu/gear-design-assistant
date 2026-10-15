import ctypes
import os
from pathlib import Path

for root in (Path("dist-debug/GearDesign/_internal").resolve(),
             Path(".venv/Lib/site-packages").resolve()):
    print("ROOT", root)
    handles = [os.add_dll_directory(str(p)) for p in (root, root / "PySide6", root / "shiboken6")]
    os.environ["PATH"] = os.pathsep.join(str(p) for p in (root, root / "PySide6", root / "shiboken6")) + os.pathsep + os.environ["PATH"]
    for name in ("python3.dll", "shiboken6/shiboken6.abi3.dll", "PySide6/Qt6Core.dll"):
        path = root / name
        if path.exists():
            try:
                ctypes.WinDLL(str(path))
                print(name, "loaded")
            except OSError as exc:
                print(name, "FAILED", exc.winerror, exc)
