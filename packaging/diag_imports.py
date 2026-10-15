import pefile
from pathlib import Path
from PyInstaller.depend.bindepend import get_imports

path = Path("dist-debug/GearDesign/_internal/PySide6/Qt6Core.dll")
resolved = {name.lower(): target for name, target in get_imports(str(path))}
pe = pefile.PE(str(path))
for descriptor in pe.DIRECTORY_ENTRY_IMPORT:
    name = descriptor.dll.decode(errors="replace")
    target = resolved.get(name.lower())
    if not target or not Path(target).is_file():
        print("UNRESOLVED", name)
        continue
    dep = pefile.PE(target)
    exports = {e.name for e in getattr(getattr(dep, "DIRECTORY_ENTRY_EXPORT", None), "symbols", []) if e.name}
    missing = [entry.name.decode(errors="replace") for entry in descriptor.imports if entry.name and entry.name not in exports]
    if missing:
        print("MISSING SYMBOLS", name, Path(target).name, len(missing), missing[:15])
    else:
        print("OK", name, Path(target).name)
