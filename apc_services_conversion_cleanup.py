from pathlib import Path
import re
import shutil
from datetime import datetime

STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = Path(f"_backup_apc_services_cleanup_{STAMP}")
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

def replace_all(text, old, new):
    return text.replace(old, new)

# ------------------------------------------------------------
# 1. Homepage cleanup
# ------------------------------------------------------------
index = Path("index.html")
if index.exists():
    text = index.read_text(encoding="utf-8")

    # Tighten the hero headline.
    text = replace_all(
        text,
        "When your autistic child struggles, start with the pattern.",
        "When your autistic child is struggling, start by understanding the pattern."
    )

    # Update Strategy Session card copy on homepage.
    text = replace_all(
        text,
        "For parents who already know the main concern and want focused help.",
        "For parents with one clear concern who want focused guidance."
    )

    text = replace_all(
        text,
        "A focused parent session for one autism-related concern at home.",
        "A focused parent session where we look at one repeated pattern in detail, such as routines, communication, refusal, learning stress, or difficult moments at home."
    )

    # Add a value line after the RM350 card if not already present.
    value_line = "You leave with a clearer understanding of what may be happening and one practical next step to observe, adjust, or try."
    if value_line not in text:
        text = replace_all(
            text,
            "A focused parent session where we look at one repeated pattern in detail, such as routines, communication, refusal, learning stress, or difficult moments at home.",
            "A focused parent session where we look at one repeated pattern in detail, such as routines, communication, refusal, learning stress, or difficult moments at home. " + value_line
        )

    # Soften Structured Parent Support unavailable wording.
    text = replace_all(
        text,
        "For parents who want deeper support across routines, communication, regulation, learning, or behaviour patterns.",
        "For parents who want deeper support across connected daily challenges."
    )

    text = replace_all(
        text,
        "5/5 slots taken",
        "Current spaces are limited"
    )

    text = replace_all(
        text,
        "Join the waitlist for the next opening.",
        "Start with a Free 15-Min First Step Call so CJ can check whether APC support is the right fit and advise the next step."
    )

    # Replace Join Waitlist buttons on homepage with Free Call where appropriate.
    text = re.sub(
        r'<a([^>]+)href="https://wa\.me/601172998168\?text=[^"]*"([^>]*)>Join Waitlist</a>',
        r'<a\1href="https://cal.com/autismpathwaysconsulting/free-discovery-call" target="_blank" rel="noopener noreferrer"\2>Start with a Free Call</a>',
        text
    )

    # In the "What CJ notices" mid-page CTA, avoid pushing paid booking too early.
    # This only changes anchors whose visible text is View Parent Support Options or Book Strategy Session.
    # Actual Strategy Session card buttons are left alone unless they were already changed by text context.
    text = re.sub(
        r'(<section[^>]*>\s*.*?What CJ notices.*?</section>)',
        lambda m: m.group(1).replace(
            'href="https://cal.com/autismpathwaysconsulting/parent-strategy-session" target="_blank" rel="noopener noreferrer">Book Strategy Session</a>',
            'href="services.html">View Parent Support Options</a>'
        ),
        text,
        flags=re.DOTALL
    )

    save_if_changed(index, text)
else:
    print("MISSING: index.html")

# ------------------------------------------------------------
# 2. Services page cleanup
# ------------------------------------------------------------
services = Path("services.html")
if services.exists():
    text = services.read_text(encoding="utf-8")

    # Improve services intro if exact line exists.
    text = replace_all(
        text,
        "APC helps parents understand what may be happening behind behaviour, communication, learning, routines, sensory overwhelm, and daily stress at home. The goal is simple: notice the pattern, understand what may be happening, and choose one practical next step.",
        "APC helps parents understand repeated daily struggles by looking at patterns across communication, regulation, routines, environment, learning demands, and adult responses. The goal is not to blame the child or the parent. The goal is to understand what may be happening and choose a practical next step your family can actually try."
    )

    # Strategy Session rewrite.
    text = replace_all(
        text,
        "A focused online parent session for one autism-related concern at home.",
        "A focused online parent session where we look at one repeated pattern in detail, such as routines, communication, refusal, learning stress, or difficult moments at home."
    )

    text = replace_all(
        text,
        "Best for one clear concern",
        "Best for one clear concern where you want focused guidance"
    )

    text = replace_all(
        text,
        "You leave with one practical next step",
        "You leave with a clearer understanding and one practical next step to observe, adjust, or try"
    )

    # Structured Parent Support rewrite.
    text = replace_all(
        text,
        "For parents who want more support across home routines, communication, regulation, learning, or behaviour patterns.",
        "For parents who want deeper support across connected daily challenges."
    )

    text = replace_all(
        text,
        "5/5 slots taken",
        "Current spaces are limited"
    )

    text = replace_all(
        text,
        "Join the waitlist for the next opening.",
        "Start with a Free 15-Min First Step Call so CJ can check whether APC support is the right fit and advise the next step."
    )

    text = replace_all(
        text,
        "Join the Structured Parent Support waitlist. Current intake is full, but the waitlist helps me know who is ready for the next opening.",
        "Start with the free 15-minute call. If deeper support is suitable, CJ will let you know the next available parent support option."
    )

    text = replace_all(
        text,
        "If you are unsure, start with the free 15-min call. If you already know the main concern, book the Strategy Session.",
        "If you are unsure, start with the free 15-minute call. If your concern is already clear and you want focused guidance, the Strategy Session may be the next step."
    )

    text = replace_all(
        text,
        "Start with the free 15-min call. If your concern is clearer and you want focused help, book an APC Parent Strategy Session.",
        "Start with the free 15-minute call. If your concern is already clear and you want focused guidance, CJ may recommend the APC Parent Strategy Session."
    )

    # Replace waitlist button text if present.
    text = replace_all(text, ">Join Waitlist<", ">Start with a Free Call<")

    # If the href is still WhatsApp waitlist but the button says Start with a Free Call, point it to Cal.com.
    text = re.sub(
        r'<a([^>]+)href="https://wa\.me/601172998168\?text=[^"]*"([^>]*)>Start with a Free Call</a>',
        r'<a\1href="https://cal.com/autismpathwaysconsulting/free-discovery-call" target="_blank" rel="noopener noreferrer"\2>Start with a Free Call</a>',
        text
    )

    save_if_changed(services, text)
else:
    print("MISSING: services.html")

# ------------------------------------------------------------
# 3. Free Tool CTA cleanup
# ------------------------------------------------------------
free_tool = Path("free-tool.html")
if free_tool.exists():
    text = free_tool.read_text(encoding="utf-8")

    text = replace_all(
        text,
        "The free tool can help in the moment. If you need support understanding repeated patterns, book a free 15-min First Step Call.",
        "The free tool can help in the moment. If the same challenges keep repeating, start with a free 15-minute First Step Call so CJ can help you understand the pattern and suggest one clearer next step."
    )

    text = replace_all(
        text,
        "Need help understanding repeated patterns? Start with a Free 15-Min First Step Call.",
        "If the same challenges keep repeating, start with a Free 15-Min First Step Call."
    )

    save_if_changed(free_tool, text)
else:
    print("MISSING: free-tool.html")

print()
print(f"Backup folder created: {BACKUP_DIR}")
print("Services conversion cleanup complete.")
