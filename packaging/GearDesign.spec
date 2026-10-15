# PyInstaller one-folder bundle. Ship the complete folder (or zip it), not only
# GearDesign.exe: the collected OCCT DLLs and Python runtime sit beside it.
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

root = Path(SPECPATH).resolve().parent
datas = [(str(root / "web"), "web")]
binaries = []
hiddenimports = []
for package in ("cadquery", "OCP", "vtkmodules"):
    package_datas, package_binaries, package_hidden = collect_all(package)
    datas += package_datas
    # PyInstaller can resolve Qt's ICU dependency to the Codex/Poppler runtime
    # on this build machine. That ICU DLL has an incompatible export ABI and
    # shadows the system ICU required by the Windows PySide6 wheel.
    binaries += [item for item in package_binaries
                 if Path(item[0]).name.casefold() not in {"icuuc.dll", "icuin.dll", "icudt78.dll"}]
    hiddenimports += package_hidden

a = Analysis(
    [str(root / "desktop_app.py")],
    pathex=[str(root)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["IPython", "jupyter", "notebook"],
    noarchive=False,
    optimize=1,
)
# Also filter the automatic dependency scan, which otherwise resolves the
# wrong same-named ICU DLL from the build host's Poppler installation.
a.binaries = [entry for entry in a.binaries
              if Path(entry[0]).name.casefold() not in {"icuuc.dll", "icuin.dll", "icudt78.dll"}]
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="GearDesign",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
bundle = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="GearDesign",
)
