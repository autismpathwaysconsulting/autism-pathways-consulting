from pathlib import Path
from datetime import datetime

ROOT = Path(".")
backup_dir = ROOT / f"_backup_final_cleanup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
backup_dir.mkdir(exist_ok=True)

html_files = list(ROOT.glob("*.html"))

OLD_CAL = "https://cal.com/autismpathwaysconsulting/free-discovery-call"
NEW_CAL = "https://cal.com/autismpathwaysconsulting/first-step-call"

replacements = {
    OLD_CAL: NEW_CAL,

    'href="#apc-calm-companion">Resources</a>': 'href="resources.html">Resources</a>',
    'href="#apc-calm-companion">Free Tool</a>': 'href="resources.html">Resources</a>',

    'Open Free Tool': 'Open APC Calm',
    'Use Free Tool': 'Use APC Calm',
    'Use the Free Tool': 'Use APC Calm',

    'Start with Free Call': 'Book First Step Call',
    'Start with a Free Call': 'Book First Step Call',

    'Free 15-Minute Discovery Call': 'Free 15-Min First Step Call',
    'Free Discovery Call': 'Free 15-Min First Step Call',
    'Book Discovery Call': 'Book First Step Call',
}

for path in html_files:
    original = path.read_text(encoding="utf-8")
    (backup_dir / path.name).write_text(original, encoding="utf-8")

    updated = original
    for old, new in replacements.items():
        updated = updated.replace(old, new)

    path.write_text(updated, encoding="utf-8")

print("Done.")
print(f"Backup created at: {backup_dir}")
print("Updated Resources links, APC Calm wording, and Cal.com First Step Call URL.")
