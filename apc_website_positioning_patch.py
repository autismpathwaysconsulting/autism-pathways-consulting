from pathlib import Path
import re
import shutil
from datetime import datetime

FILES = [
    "index.html",
    "services.html",
    "about.html",
    "start.html",
    "free-tool.html",
]

STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP_DIR = Path(f"_backup_apc_positioning_{STAMP}")
BACKUP_DIR.mkdir(exist_ok=True)

def backup(path: Path):
    if path.exists():
        shutil.copy2(path, BACKUP_DIR / path.name)

def replace_all(text, old, new):
    return text.replace(old, new)

def insert_before(text, marker, block):
    if block.strip() in text:
        return text
    idx = text.find(marker)
    if idx == -1:
        return text
    return text[:idx] + block + "\n\n" + text[idx:]

def insert_after(text, marker, block):
    if block.strip() in text:
        return text
    idx = text.find(marker)
    if idx == -1:
        return text
    idx_end = idx + len(marker)
    return text[:idx_end] + "\n\n" + block + text[idx_end:]

def write_if_changed(path: Path, new_text: str):
    old_text = path.read_text(encoding="utf-8")
    if old_text != new_text:
        backup(path)
        path.write_text(new_text, encoding="utf-8")
        print(f"UPDATED: {path}")
    else:
        print(f"NO CHANGE: {path}")

# ------------------------------------------------------------
# 1. Homepage updates
# ------------------------------------------------------------
index = Path("index.html")
if index.exists():
    text = index.read_text(encoding="utf-8")

    # Tighten hero headline if the current variant exists.
    text = replace_all(
        text,
        "When your autistic child struggles, start with the pattern.",
        "When your autistic child is struggling, start by understanding the pattern."
    )

    text = replace_all(
        text,
        "When home feels confusing, start with the pattern.",
        "When your autistic child is struggling, start by understanding the pattern."
    )

    # Keep primary CTA as free call and make secondary CTA parent-support focused.
    text = replace_all(text, ">Book Strategy Session<", ">View Parent Support Options<")
    text = replace_all(text, ">Start with Free Call<", ">Start with Free Call<")

    # Strengthen trust section heading if present.
    text = replace_all(
        text,
        "Support that is practical, respectful, and clear.",
        "Support shaped by real school-based and 1-to-1 experience."
    )

    # Soften broad line.
    text = replace_all(
        text,
        "Small changes can matter",
        "Small changes can make the next step clearer"
    )

    text = replace_all(
        text,
        "A clearer routine, fewer instructions, a visual support, or a calmer transition can make home easier to understand.",
        "A clearer routine, fewer instructions, a visual support, or a calmer transition can make the next step easier to understand."
    )

    write_if_changed(index, text)
else:
    print("MISSING: index.html")

# ------------------------------------------------------------
# 2. Services page updates
# ------------------------------------------------------------
services = Path("services.html")
if services.exists():
    text = services.read_text(encoding="utf-8")

    # Strengthen Strategy Session copy if existing copy is present.
    text = replace_all(
        text,
        "A focused parent session for one autism-related concern at home.",
        "A focused parent session where we look at one repeated pattern in detail, such as routines, communication, refusal, learning stress, or difficult moments at home. You leave with a clearer understanding of what may be happening and one practical next step to observe, adjust, or try."
    )

    text = replace_all(
        text,
        "For parents who already know the main concern and want focused help.",
        "For parents with one clear concern who want focused guidance."
    )

    # Replace waitlist wording with a softer option-focused phrase.
    text = replace_all(text, "Join the waitlist for the next opening.", "Ask about the next available parent support option.")
    text = replace_all(text, ">Join Waitlist<", ">Ask About Parent Support<")

    # Add the new section before scope section if a suitable marker exists.
    how_apc_section = """
<section class="section section-soft">
  <div class="container">
    <p class="eyebrow">How APC works</p>
    <h2>How APC looks at your child’s struggle</h2>
    <p>When a parent shares a concern, APC does not jump straight into generic tips.</p>
    <p>We look at the pattern around the situation.</p>

    <div class="card-grid">
      <div class="card">What happened before the behaviour?</div>
      <div class="card">What was the child being asked to do?</div>
      <div class="card">Was the instruction clear?</div>
      <div class="card">Was the environment too much?</div>
      <div class="card">Did the child have enough processing time?</div>
      <div class="card">How did the adult response affect the next step?</div>
    </div>

    <div class="callout">
      <p>This helps parents move away from blame and towards a more practical question:</p>
      <p><strong>What does my child need me to understand here?</strong></p>
    </div>
  </div>
</section>
""".strip()

    if "How APC looks at your child’s struggle" not in text:
        markers = [
            '<section class="section scope',
            '<section class="section section-scope',
            'What APC can help with',
            'APC can help with',
        ]
        inserted = False
        for marker in markers:
            if marker in text:
                text = insert_before(text, marker, how_apc_section)
                inserted = True
                break
        if not inserted:
            text = text.replace("</main>", how_apc_section + "\n\n</main>")

    write_if_changed(services, text)
else:
    print("MISSING: services.html")

# ------------------------------------------------------------
# 3. About page updates
# ------------------------------------------------------------
about = Path("about.html")
if about.exists():
    text = about.read_text(encoding="utf-8")

    text = replace_all(
        text,
        "Every behaviour is communication. Once you understand what your child is trying to say, everything changes.",
        "Behaviour can give us clues. When we understand the pattern, the next step becomes clearer."
    )

    text = replace_all(
        text,
        "Once you understand what your child is trying to say, everything changes.",
        "When we understand the pattern, the next step becomes clearer."
    )

    # Add school observation section if not already present.
    school_observation_section = """
<section class="section section-soft">
  <div class="container">
    <p class="eyebrow">School-based insight</p>
    <h2>What I often notice in school</h2>
    <p>From my experience as a shadow aide and special needs teacher, many autistic children show patterns that adults may not always notice immediately.</p>

    <div class="card-grid">
      <div class="card">A child may understand more than they can explain.</div>
      <div class="card">A child may copy because they do not know how to start.</div>
      <div class="card">A delayed response may mean they need more processing time.</div>
      <div class="card">Unclear moments like waiting, group work, and transitions can be harder than they look.</div>
      <div class="card">Some children seem fine in school, then release the stress later at home.</div>
      <div class="card">Behaviour can show confusion, overwhelm, uncertainty, or a need for support.</div>
    </div>
  </div>
</section>
""".strip()

    if "What I often notice in school" not in text:
        markers = [
            "Why parents work with me",
            "My background",
            "</main>"
        ]
        inserted = False
        for marker in markers:
            if marker in text and marker != "</main>":
                text = insert_after(text, marker, "\n" + school_observation_section)
                inserted = True
                break
        if not inserted:
            text = text.replace("</main>", school_observation_section + "\n\n</main>")

    write_if_changed(about, text)
else:
    print("MISSING: about.html")

# ------------------------------------------------------------
# 4. Start page updates
# ------------------------------------------------------------
start = Path("start.html")
if start.exists():
    text = start.read_text(encoding="utf-8")

    text = replace_all(text, "Join Parent Support Waitlist", "View Parent Support Options")
    text = replace_all(text, "Join Waitlist", "View Parent Support Options")
    text = replace_all(text, "join the waitlist", "view parent support options")
    text = replace_all(text, "Join the waitlist", "View parent support options")

    credibility_line = """
<p class="trust-line">Guidance from an autism educator with 10 years of school-based and 1-to-1 experience supporting autistic children.</p>
""".strip()

    if "10 years of school-based and 1-to-1 experience" not in text:
        markers = [
            "Guidance from an autism educator.",
            "Free 15-Min First Step Call",
            "</h1>"
        ]
        inserted = False
        for marker in markers:
            if marker in text:
                text = insert_after(text, marker, "\n" + credibility_line)
                inserted = True
                break

    write_if_changed(start, text)
else:
    print("MISSING: start.html")

# ------------------------------------------------------------
# 5. Free tool page updates
# ------------------------------------------------------------
free_tool = Path("free-tool.html")
if free_tool.exists():
    text = free_tool.read_text(encoding="utf-8")

    scope_note = """
<div class="notice scope-note">
  <p><strong>Important:</strong> APC Calm Companion is a support tool, not a replacement for professional advice, therapy, medical care, or crisis support.</p>
</div>
""".strip()

    if "APC Calm Companion is a support tool" not in text:
        markers = [
            "A free parent support tool for routines, communication, calm-down support, transitions, and difficult moments at home.",
            "The free tool can help in the moment.",
            "</main>"
        ]
        inserted = False
        for marker in markers:
            if marker in text and marker != "</main>":
                text = insert_after(text, marker, "\n" + scope_note)
                inserted = True
                break
        if not inserted:
            text = text.replace("</main>", scope_note + "\n\n</main>")

    write_if_changed(free_tool, text)
else:
    print("MISSING: free-tool.html")

print()
print(f"Backup folder created: {BACKUP_DIR}")
print("Patch complete.")
