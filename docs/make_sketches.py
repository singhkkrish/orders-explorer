"""Generates the initial wireframes in design/. Run: python3 docs/make_sketches.py (needs Pillow)."""
import random
from PIL import Image, ImageDraw, ImageFont

random.seed(7)
W, H = 1366, 768
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
f = lambda s, b=False: ImageFont.truetype(FB if b else F, s)
INK = (40, 40, 48); GREY = (150, 150, 160); LIGHT = (232, 232, 238); ACC = (79, 70, 229); PAPER = (253, 252, 248)


def wob(d, p0, p1, col=INK, w=2):
    """Slightly wobbly line, to read as a sketch."""
    (x0, y0), (x1, y1) = p0, p1
    pts = [(x0 + (x1 - x0) * t / 6 + random.uniform(-1.2, 1.2), y0 + (y1 - y0) * t / 6 + random.uniform(-1.2, 1.2)) for t in range(7)]
    d.line(pts, fill=col, width=w)


def box(d, x, y, w, h, label="", col=INK, fill=None, lw=2, size=13, bold=False, anchor="mm"):
    if fill:
        d.rectangle([x, y, x + w, y + h], fill=fill)
    wob(d, (x, y), (x + w, y), col, lw); wob(d, (x + w, y), (x + w, y + h), col, lw)
    wob(d, (x + w, y + h), (x, y + h), col, lw); wob(d, (x, y + h), (x, y), col, lw)
    if label:
        if anchor == "mm":
            d.text((x + w / 2, y + h / 2), label, font=f(size, bold), fill=col, anchor="mm")
        else:
            d.text((x + 8, y + h / 2), label, font=f(size, bold), fill=col, anchor="lm")


def note(d, x, y, text, size=12, col=ACC):
    d.text((x, y), text, font=f(size), fill=col)


def common(d, title):
    d.text((20, 10), title, font=f(15, True), fill=INK)
    note(d, 1366 - 330, 12, "WIREFRAME v0 · 1366×768 · not to scale", 11, GREY)


def frame(d):
    box(d, 20, 36, 1326, 716, lw=3)
    # header
    box(d, 20, 36, 1326, 40, "", fill=(245, 245, 250))
    d.text((34, 56), "[logo]  Orders Explorer", font=f(14, True), fill=INK, anchor="lm")
    box(d, 1130, 44, 100, 24, "Shortcuts ?", size=11); box(d, 1240, 44, 94, 24, "Export CSV", col=ACC, size=11)
    # toolbar
    d.text((34, 100), "orders.json", font=f(13, True), fill=INK, anchor="lm")
    d.text((140, 100), "1,284 of 50,000 orders   ·   3 selected (2 in view)", font=f(13), fill=INK, anchor="lm")
    box(d, 1200, 88, 134, 24, "Filters (2) ▾", size=11)


def chips(d, items, y=124):
    x = 34
    for t in items:
        w = len(t) * 7 + 34
        box(d, x, y, w, 22, t + "  ×", size=11, col=ACC); x += w + 8
    d.text((x + 6, y + 11), "Clear all", font=f(11), fill=GREY, anchor="lm")


def grid(d, rows=True, y0=156):
    cols = [("☐", 30), ("Order ID", 110), ("Customer ▲", 150), ("Status", 90), ("Amount", 100), ("Created", 140), ("Region", 80), ("Channel", 80), ("Notes", 200), ("...", 60)]
    box(d, 34, y0 - 4, 1300, 30, "", fill=(240, 240, 246))
    x = 34
    for i, (c, w) in enumerate(cols):
        d.text((x + 8, y0 + 11), c, font=f(11, True), fill=INK, anchor="lm")
        wob(d, (x + w, y0 - 4), (x + w, y0 + 26), GREY, 1); x += w + 20
    note(d, 340, y0 - 20, "sticky header · click = sort · drag edge = resize · pin icon on hover", 11)
    if rows:
        for r in range(14):
            yy = y0 + 32 + r * 32
            if r in (2, 3): d.rectangle([34, yy, 1334, yy + 30], fill=(225, 224, 252))
            if r == 5: box(d, 150, yy + 2, 150, 27, "", col=ACC, lw=3)
            wob(d, (34, yy + 31), (1334, yy + 31), LIGHT, 1)
            x = 34
            for i, (c, w) in enumerate(cols):
                if i == 0: d.text((x + 8, yy + 15), "☑" if r in (2, 3) else "☐", font=f(12), fill=INK, anchor="lm")
                else: d.rectangle([x + 8, yy + 11, x + 8 + int(w * random.uniform(.4, .8)), yy + 18], fill=(205, 205, 214))
                x += w + 20
        note(d, 1000, 650, "↑ only ~25 rows exist in the DOM (virtualised)", 12)
        note(d, 170, 640, "focused cell = 2px accent outline", 12)
        note(d, 1180, 30 + 125, "", 12)


def detail_panel(d):
    box(d, 960, 36, 386, 716, "", fill=(255, 255, 255), lw=3)
    d.text((976, 62), "ORD-0001234   ✕", font=f(14, True), fill=INK, anchor="lm")
    for i, t in enumerate(["Customer", "Email", "Status", "Amount", "Created", "Updated", "Region", "Notes (plain text)"]):
        d.text((976, 100 + i * 34), t, font=f(11), fill=GREY, anchor="lm"); d.rectangle([1100, 94 + i * 34, 1300, 104 + i * 34], fill=(205, 205, 214))


# ---------- 1. normal state ----------
im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
common(d, "1 · Normal state — data loaded, 2 filters active, 3 rows selected")
frame(d)
chips(d, ["Status is Shipped, Delivered", "OR Priority is 1", "AND Amount > 500"])
grid(d)
note(d, 40, 722, "Selected: 3  ·  Export CSV exports ALL selected rows (even if hidden by filter)", 12)
im.save("design/normal-state.png")

# ---------- 2. empty state ----------
im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
common(d, "2 · Empty state — filters match 0 orders")
frame(d)
d.text((140, 100), "0 of 50,000 orders   ·   3 selected (0 in view)", font=f(13), fill=INK, anchor="lm")
chips(d, ["Amount > 5000"])
grid(d, rows=False)
box(d, 480, 300, 400, 190, "", col=GREY, lw=1)
d.text((680, 340), "No orders match these filters", font=f(16, True), fill=INK, anchor="mm")
d.text((680, 372), "Try widening a condition or clear the filters.", font=f(12), fill=GREY, anchor="mm")
box(d, 600, 410, 160, 34, "Clear filters", col=ACC, bold=True, size=13, fill=(238, 237, 253))
note(d, 880, 320, "← filter builder stays visible\n   and editable above", 12)
im.save("design/empty-state.png")

# ---------- 3. filter builder ----------
im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
common(d, "3 · Filter builder — one level of groups (OR inside, AND between)")
frame(d)
box(d, 34, 122, 1300, 260, "", col=GREY, lw=1, fill=(250, 250, 253))
def cond(y, field, op, val, valw=260):
    box(d, 60, y, 140, 28, field + " ▾", size=12); box(d, 210, y, 130, 28, op + " ▾", size=12)
    box(d, 350, y, valw, 28, val, size=12); box(d, 350 + valw + 10, y, 28, 28, "x", size=12, col=GREY)
box(d, 46, 134, 1276, 108, "", col=ACC, lw=1); note(d, 56, 137, "GROUP 1 — match ANY (OR)", 11)
cond(158, "Status", "is one of", "Shipped, Delivered  ▾ (search + checkboxes)", 340); cond(194, "Priority", "is one of", "1 – Highest ▾", 340)
box(d, 1100, 160, 130, 26, "+ OR condition", size=11, col=ACC)
d.text((680, 256), "—— AND ——", font=f(12, True), fill=GREY, anchor="mm")
box(d, 46, 268, 1276, 74, "", col=ACC, lw=1); note(d, 56, 271, "GROUP 2 — match ANY (OR)", 11)
cond(292, "Amount", "between", "500    to    3000", 260)
box(d, 1100, 294, 130, 26, "+ OR condition", size=11, col=ACC); box(d, 46, 350, 150, 26, "+ Add group (AND)", size=11, col=ACC)
note(d, 640, 300, "← operators/value inputs change with field type:\n   text: contains / not contains / equals\n   number: = > < between   date: before / after / between", 11)
chips(d, ["Status is Shipped, Delivered", "OR Priority is 1", "AND Amount 500–3000"], 394)
grid(d, rows=True, y0=426)
im.save("design/filter-builder.png")

# ---------- 4. detail panel (bonus) ----------
im = Image.new("RGB", (W, H), PAPER); d = ImageDraw.Draw(im)
common(d, "4 · Order details side panel (Enter or double-click on a row)")
frame(d); chips(d, ["Status is Shipped"]); grid(d); detail_panel(d)
im.save("design/details-panel.png")
print("ok")
