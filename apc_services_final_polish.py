from pathlib import Path
import re
import shutil
from datetime import datetime

STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = Path(f"_backup_apc_services_final_polish_{STAMP}")
BACKUP_DIR.mkdir(exist_ok=True)

SERVICES = Path("services.html")
FREE_TOOL = Path("free-tool.html")

FREE_CALL_PRIMARY = (
    '<a class="btn btn-primary" '
    'href="https://cal.com/autismpathwaysconsulting/free-discovery-call" '
    'target="_blank" rel="noopener noreferrer">Start with Free Call</a>'
)

STRATEGY_SECONDARY = (
    '<a class="btn btn-secondary" '
    'href="https://cal.com/autismpathwaysconsulting/parent-strategy-session" '
    'target="_blank" rel="noopener noreferrer">Book Strategy Session</a>'
)

ASK_SUPPORT_PRIMARY = (
    '<a class="btn btn-primary" '
    'href="https://wa.me/601172998168?text=Hi%20CJ%2C%20I%20would%20like%20to%20ask%20about%20APC%20Structured%20Parent%20Support." '
    'target="_blank" rel="noopener noreferrer">Ask About Parent Support</a>'
)

def backup(path: Path):
    if path.exists():
        shutil.copy2(path, BACKUP_DIR / path.name)

def save_if_changed(path: Path, text: str):
    old = path.read_text(encoding="utf-8")
    if old != text:
        backup(path)
        path.write_text(text, encoding="utf-8")
        print(f"UPDATED: {path}")
    else:
        print(f"NO CHANGE: {path}")

def clean_duplicate_attrs(text: str) -> str:
    return text.replace(
        'target="_blank" rel="noopener noreferrer" target="_blank" rel="noopener noreferrer"',
        'target="_blank" rel="noopener noreferrer"'
    )

def swap_strategy_free_pairs(text: str) -> str:
    """
    Anywhere a generic CTA pair says:
    Book Strategy Session first, then Start with Free Call,
    swap it so Free Call comes first.
    """
    pattern = re.compile(
        r'<a\s+class="btn\s+btn-primary"\s+href="https://cal\.com/autismpathwaysconsulting/parent-strategy-session"\s+target="_blank"\s+rel="noopener noreferrer">Book Strategy Session</a>\s*'
        r'<a\s+class="btn\s+btn-secondary"\s+href="https://cal\.com/autismpathwaysconsulting/free-discovery-call"\s+target="_blank"\s+rel="noopener noreferrer">Start with Free Call</a>',
        re.DOTALL
    )
    return pattern.sub(FREE_CALL_PRIMARY + "\n    " + STRATEGY_SECONDARY, text)

def fix_structured_parent_support_block(text: str) -> str:
    """
    In the Structured Parent Support card only:
    - keep Ask About Parent Support
    - remove the extra Book Strategy Session button
    - make the waitlist CTA wording fit the limited-support pathway
    """
    start = text.find("Structured Parent Support")
    if start == -1:
        print("WARNING: Structured Parent Support text not found.")
        return text

    # Find a safe endpoint after the card, before later page sections.
    candidates = []
    for marker in [
        "How APC looks at your child’s struggle",
        "How APC looks at your child's struggle",
        "What parents usually want to know",
        "Common questions",
        "Not sure where to start",
        "</main>"
    ]:
        pos = text.find(marker, start + 1)
        if pos != -1:
            candidates.append(pos)

    if not candidates:
        print("WARNING: Could not find endpoint for Structured Parent Support block.")
        return text

    end = min(candidates)
    before = text[:start]
    block = text[start:end]
    after = text[end:]

    block = block.replace(
        "Ask about the next available parent support option.",
        "Start with a Free 15-Min First Step Call so CJ can check whether deeper support is the right fit. If deeper support is suitable, CJ will advise the next available parent support option."
    )

    block = block.replace(
        "Start with a Free 15-Min First Step Call so CJ can check whether deeper support is the right fit.</p>",
        "Start with a Free 15-Min First Step Call so CJ can check whether deeper support is the right fit. If deeper support is suitable, CJ will advise the next available parent support option.</p>"
    )

    # Normalise older waitlist WhatsApp copy to the preferred button.
    block = re.sub(
        r'<a\s+class="btn\s+btn-primary"\s+href="https://wa\.me/601172998168\?text=[^"]*"\s+target="_blank"\s+rel="noopener noreferrer">Ask About Parent Support</a>',
        ASK_SUPPORT_PRIMARY,
        block
    )

    # Remove any Book Strategy Session button inside Structured Parent Support.
    block = re.sub(
        r'\s*<a\s+class="btn\s+btn-secondary"\s+href="https://cal\.com/autismpathwaysconsulting/parent-strategy-session"\s+target="_blank"\s+rel="noopener noreferrer">Book Strategy Session</a>',
        '',
        block
    )

    block = re.sub(
        r'\s*<a\s+class="btn\s+btn-primary"\s+href="https://cal\.com/autismpathwaysconsulting/parent-strategy-session"\s+target="_blank"\s+rel="noopener noreferrer">Book Strategy Session</a>',
        '',
        block
    )

    return before + block + after

def add_services_readability_css(text: str) -> str:
    """
    Screenshot shows the hero paragraph may appear too stretched on desktop.
    This prevents justified-looking word spacing in the Services hero.
    """
    marker = "/* APC hero paragraph readability patch */"
    if marker in text:
        return text

    css = """
/* APC hero paragraph readability patch */
.apc-services-hero p,
.services-hero p,
.hero p,
.section-hero p {
  text-align: left;
  text-wrap: pretty;
}
""".rstrip()

    if "</style>" in text:
        return text.replace("</style>", css + "\n</style>", 1)

    return text

# ------------------------------------------------------------
# Patch services.html
# ------------------------------------------------------------
if SERVICES.exists():
    text = SERVICES.read_text(encoding="utf-8")
    text = clean_duplicate_attrs(text)

    # Replace older hero intro if it exists.
    text = text.replace(
        "APC helps parents understand what may be happening behind behaviour, communication, learning, routines, sensory overwhelm, and daily stress at home. The goal is simple: notice the pattern, understand what may be happening, and choose one practical next step.",
        "APC helps parents understand repeated daily struggles by looking at patterns across communication, regulation, routines, environment, learning demands, and adult responses. Start with a free call, then CJ will advise whether a focused Strategy Session or limited Structured Parent Support is the right next step."
    )

    text = swap_strategy_free_pairs(text)
    text = fix_structured_parent_support_block(text)
    text = add_services_readability_css(text)

    save_if_changed(SERVICES, text)
else:
    print("MISSING: services.html")

# ------------------------------------------------------------
# Patch free-tool.html only if repeated CTA appears again
# ------------------------------------------------------------
if FREE_TOOL.exists():
    text = FREE_TOOL.read_text(encoding="utf-8")
    text = clean_duplicate_attrs(text)

    text = text.replace(
        '<p class="free-tool-bridge">If the same challenges keep repeating, start with a Free 15-Min First Step Call.</p>',
        ''
    )

    text = text.replace(
        "Need help understanding repeated patterns? Start with a Free 15-Min First Step Call.",
        ""
    )

    save_if_changed(FREE_TOOL, text)
else:
    print("MISSING: free-tool.html")

print()
print(f"Backup folder created: {BACKUP_DIR}")
print("Services final polish complete.")
