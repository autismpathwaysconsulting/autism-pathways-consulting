from pathlib import Path
import re
import shutil
from datetime import datetime

STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = Path(f"_backup_apc_waitlist_cta_final_fix_{STAMP}")
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

FREE_CALL_BTN_PRIMARY = (
    '<a class="btn btn-primary" '
    'href="https://cal.com/autismpathwaysconsulting/free-discovery-call" '
    'target="_blank" rel="noopener noreferrer">Start with Free Call</a>'
)

STRATEGY_BTN_SECONDARY = (
    '<a class="btn btn-secondary" '
    'href="https://cal.com/autismpathwaysconsulting/parent-strategy-session" '
    'target="_blank" rel="noopener noreferrer">Book Strategy Session</a>'
)

ASK_PARENT_SUPPORT_BTN_SECONDARY = (
    '<a class="btn btn-secondary" '
    'href="https://wa.me/601172998168?text=Hi%20CJ%2C%20I%20would%20like%20to%20ask%20about%20APC%20Structured%20Parent%20Support." '
    'target="_blank" rel="noopener noreferrer">Ask About Parent Support</a>'
)

# ------------------------------------------------------------
# 1. Services page final alignment
# ------------------------------------------------------------
services = Path("services.html")

if services.exists():
    text = services.read_text(encoding="utf-8")
    text = clean_duplicate_attrs(text)

    # A. Swap any remaining generic CTA pair where Strategy appears before Free Call.
    # This does not affect a single Strategy Session card button.
    pair_pattern = re.compile(
        r'<a\s+class="btn\s+btn-primary"\s+href="https://cal\.com/autismpathwaysconsulting/parent-strategy-session"\s+target="_blank"\s+rel="noopener noreferrer">Book Strategy Session</a>\s*'
        r'<a\s+class="btn\s+btn-secondary"\s+href="https://cal\.com/autismpathwaysconsulting/free-discovery-call"\s+target="_blank"\s+rel="noopener noreferrer">Start with Free Call</a>',
        re.DOTALL
    )
    text = pair_pattern.sub(FREE_CALL_BTN_PRIMARY + "\n" + STRATEGY_BTN_SECONDARY, text)

    # B. In the Structured Parent Support card, replace Book Strategy Session with Ask About Parent Support.
    # Limit the edit to the Structured Parent Support block.
    structured_pattern = re.compile(
        r'(Structured Parent Support.*?)(?=<section|<div class="apc-services-section|What parents ask about|How APC looks|Common questions|</main>)',
        re.DOTALL
    )

    def fix_structured_block(match):
        block = match.group(1)

        block = block.replace(
            "Ask about the next available parent support option.",
            "Start with a Free 15-Min First Step Call so CJ can check whether deeper support is the right fit. If deeper support is suitable, CJ will advise the next available parent support option."
        )

        # Replace any Strategy button inside the Structured Parent Support block.
        block = re.sub(
            r'<a\s+class="btn\s+btn-secondary"\s+href="https://cal\.com/autismpathwaysconsulting/parent-strategy-session"\s+target="_blank"\s+rel="noopener noreferrer">Book Strategy Session</a>',
            ASK_PARENT_SUPPORT_BTN_SECONDARY,
            block
        )

        block = re.sub(
            r'<a\s+class="btn\s+btn-primary"\s+href="https://cal\.com/autismpathwaysconsulting/parent-strategy-session"\s+target="_blank"\s+rel="noopener noreferrer">Book Strategy Session</a>',
            ASK_PARENT_SUPPORT_BTN_SECONDARY,
            block
        )

        return block

    text = structured_pattern.sub(fix_structured_block, text, count=1)

    save_if_changed(services, text)
else:
    print("MISSING: services.html")

# ------------------------------------------------------------
# 2. Free Tool page final cleanup
# ------------------------------------------------------------
free_tool = Path("free-tool.html")

if free_tool.exists():
    text = free_tool.read_text(encoding="utf-8")
    text = clean_duplicate_attrs(text)

    # Replace old CTA wording if it still exists.
    text = text.replace(
        "The free tool can help in the moment. If you need support understanding repeated patterns, book a free 15-min First Step Call.",
        "The free tool can help in the moment. If the same challenges keep repeating, start with a free 15-minute First Step Call so CJ can help you understand the pattern and suggest one clearer next step."
    )

    # Remove repeated bridge line if it exists.
    text = text.replace(
        '<p class="free-tool-bridge">If the same challenges keep repeating, start with a Free 15-Min First Step Call.</p>',
        ''
    )

    text = text.replace(
        "Need help understanding repeated patterns? Start with a Free 15-Min First Step Call.",
        ""
    )

    save_if_changed(free_tool, text)
else:
    print("MISSING: free-tool.html")

print()
print(f"Backup folder created: {BACKUP_DIR}")
print("Final waitlist CTA alignment complete.")
