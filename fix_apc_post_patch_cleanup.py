from pathlib import Path
import re
import shutil
from datetime import datetime

STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = Path(f"_backup_apc_cleanup_{STAMP}")
BACKUP_DIR.mkdir(exist_ok=True)

def backup(path: Path):
    if path.exists():
        shutil.copy2(path, BACKUP_DIR / path.name)

def save_if_changed(path: Path, new_text: str):
    old_text = path.read_text(encoding="utf-8")
    if old_text != new_text:
        backup(path)
        path.write_text(new_text, encoding="utf-8")
        print(f"UPDATED: {path}")
    else:
        print(f"NO CHANGE: {path}")

# ------------------------------------------------------------
# 1. Fix homepage buttons where text says View Parent Support Options
#    but href still points to parent-strategy-session.
# ------------------------------------------------------------
index = Path("index.html")
if index.exists():
    text = index.read_text(encoding="utf-8")

    # Convert only anchors that display "View Parent Support Options"
    # and still point to the paid Strategy Session URL.
    pattern = re.compile(
        r'<a\s+class="([^"]*)"\s+href="https://cal\.com/autismpathwaysconsulting/parent-strategy-session"\s+target="_blank"\s+rel="noopener noreferrer">View Parent Support Options</a>'
    )

    def replace_view_options_link(match):
        classes = match.group(1)
        return f'<a class="{classes}" href="services.html">View Parent Support Options</a>'

    text = pattern.sub(replace_view_options_link, text)

    # Keep actual Book Strategy Session buttons as paid booking links.
    # Only fix the mismatched "View Parent Support Options" buttons.
    save_if_changed(index, text)
else:
    print("MISSING: index.html")

# ------------------------------------------------------------
# 2. Fix broken start.html trust-line inserted inside closing h2.
# ------------------------------------------------------------
start = Path("start.html")
if start.exists():
    text = start.read_text(encoding="utf-8")

    # Specific fix for:
    # <p class="trust-line">...</p></h2>
    # into:
    # </h2>
    # <p class="trust-line">...</p>
    text = re.sub(
        r'(<p class="trust-line">Guidance from an autism educator with 10 years of school-based and 1-to-1 experience supporting autistic children\.</p>)\s*</h2>',
        r'</h2>\n\1',
        text
    )

    # If duplicate trust lines were accidentally added, keep only the first.
    trust_line = '<p class="trust-line">Guidance from an autism educator with 10 years of school-based and 1-to-1 experience supporting autistic children.</p>'
    if text.count(trust_line) > 1:
        first = text.find(trust_line)
        before = text[:first + len(trust_line)]
        after = text[first + len(trust_line):].replace(trust_line, "")
        text = before + after

    save_if_changed(start, text)
else:
    print("MISSING: start.html")

print()
print(f"Backup folder created: {BACKUP_DIR}")
print("Cleanup complete.")
