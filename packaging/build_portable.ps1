param([string]$OutputDirectory = 'dist')

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
$outputRoot = Join-Path $projectRoot $OutputDirectory
$buildRoot = Join-Path $projectRoot ($OutputDirectory.TrimEnd('\/') + '-build')
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Project Python environment is missing. Recreate .venv and install requirements first.'
}

& $python -m PyInstaller --noconfirm (Join-Path $projectRoot 'packaging\GearDesign.spec') `
    --distpath $outputRoot `
    --workpath $buildRoot
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE" }

$bundle = Join-Path $outputRoot 'GearDesign'
if (-not (Test-Path -LiteralPath (Join-Path $bundle 'GearDesign.exe'))) {
    throw 'Build finished without GearDesign.exe.'
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'PORTABLE-README.txt') -Destination $bundle -Force

$archive = Join-Path $outputRoot 'GearDesign-Portable.zip'
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
$zipScript = @'
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
archive = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=1) as out:
    for path in root.rglob("*"):
        if path.is_file():
            out.write(path, pathlib.Path(root.name) / path.relative_to(root))
with zipfile.ZipFile(archive) as check:
    bad = check.testzip()
    if bad:
        raise SystemExit(f"Corrupt archive member: {bad}")
    print(f"Archive verified: {len(check.infolist())} files")
'@
$zipScript | & $python - $bundle $archive
if ($LASTEXITCODE -ne 0) { throw "Portable archive creation failed with exit code $LASTEXITCODE" }
Write-Host "Portable app: $bundle\GearDesign.exe"
Write-Host "Portable archive: $archive"
