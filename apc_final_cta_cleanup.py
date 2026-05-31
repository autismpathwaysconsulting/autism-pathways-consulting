from pathlib import Path
import re
import shutil
from datetime import datetime

STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = Path(f"_backup_apc_final_cta_cleanup_{STAMP}")
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

def clean_duplicate_attrs(text: str) -> str:
    return text.replace(
        'target="_blank" rel="noopener noreferrer" target="_blank" rel="noopener noreferrer"',
        'target="_blank" rel="noopener noreferrer"'
    )

# ------------------------------------------------------------
# 1. Services page: make Free Call the first top CTA
# ------------------------------------------------------------
services = Path("services.html")

if services.exists():
    text = services.read_text(encoding="utf-8")
    text = clean_duplicate_attrs(text)

    free_call_btn = (
        '<a class="btn btn-primary" '
        'href="https://cal.com/autismpathwaysconsulting/free-discovery-call" '
        'target="_blank" rel="noopener noreferrer">Start with Free Call</a>'
    )

    strategy_btn = (
        '<a class="btn btn-secondary" '
        'href="https://cal.com/autismpathwaysconsulting/parent-strategy-session" '
        'target="_blank" rel="noopener noreferrer">Book Strategy Session</a>'
    )

    # Swap only the first hero/top pair where Strategy appears before Free Call.
    pattern = re.compile(
        r'<a\s+class="btn\s+btn-primary"\s+href="https://cal\.com/autismpathwaysconsulting/parent-strategy-session"\s+target="_blank"\s+rel="noopener noreferrer">Book Strategy Session</a>\s*'
        r'<a\s+class="btn\s+btn-secondary"\s+href="https://cal\.com/autismpathwaysconsulting/free-discovery-call"\s+target="_blank"\s+rel="noopener noreferrer">Start with Free Call</a>',
        re.DOTALL
    )

    text, count = pattern.subn(free_call_btn + "\n" + strategy_btn, text, count=1)

    # Fallback if classes or spacing differ.
    if count == 0:
        pattern_fallback = re.compile(
            r'(<a[^>]+href="https://cal\.com/autismpathwaysconsulting/parent-strategy-session"[^>]*>Book Strategy Session</a>)\s*'
            r'(<a[^>]+href="https://cal\.com/autismpathwaysconsulting/free-discovery-call"[^>]*>Start with Free Call</a>)',
            re.DOTALL
        )
        text, count = pattern_fallback.subn(free_call_btn + "\n" + strategy_btn, text, count=1)

    # Final polish for limited support wording if this older line still exists.
    text = text.replace(
        "Ask about the next available parent support option.",
        "Start with a Free 15-Min First Step Call so CJ can check whether deeper support is the right fit."
    )

    save_if_changed(services, text)
else:
    print("MISSING: services.html")

# ------------------------------------------------------------
# 2. Free Tool page: remove repeated CTA line
# ------------------------------------------------------------
free_tool = Path("free-tool.html")

if free_tool.exists():
    text = free_tool.read_text(encoding="utf-8")
    text = clean_duplicate_attrs(text)

    # Keep the stronger CTA paragraph and remove the repeated bridge line.
    text = text.replace(
        '<p class="free-tool-bridge">If the same challenges keep repeating, start with a Free 15-Min First Step Call.</p>',
        ''
    )

    # If an older CTA sentence is still present, replace it with the stronger version.
    text = text.replace(
        "The free tool can help in the moment. If you need support understanding repeated patterns, book a free 15-min First Step Call.",
        "The free tool can help in the moment. If the same challenges keep repeating, start with a free 15-minute First Step Call so CJ can help you understand the pattern and suggest one clearer next step."
    )

    save_if_changed(free_tool, text)
else:
    print("MISSING: free-tool.html")

print()
print(f"Backup folder created: {BACKUP_DIR}")
print("Final CTA cleanup complete.")
