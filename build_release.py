"""Build an allowlisted ZIP. Never removes files or includes browser test profiles."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent
version = json.loads((root / "manifest.json").read_text(encoding="utf-8"))["version"]
output = root.parent / f"简历速填+投递簿-v{version}.zip"
files = ["manifest.json", "background.js", "content.js", "options.html", "options.js",
         "popup.html", "popup.js", "styles.css", "recorder.js", "tracker.html", "tracker.js", "tracker.css", "README.md", "示例资料.json"]
files += [str(p.relative_to(root)) for folder in ["shared", "demo"]
          for p in (root / folder).iterdir() if p.is_file()]
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for filename in files:
        archive.write(root / filename, "resume-autofill/" + filename.replace("\\", "/"))
with ZipFile(output) as archive:
    assert archive.testzip() is None
    assert "resume-autofill/manifest.json" in archive.namelist()
    assert not any(".artifacts" in name or "tests/" in name for name in archive.namelist())
print(f"Built {output} ({output.stat().st_size:,} bytes, {len(files)} files)")
