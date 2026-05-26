"""Tiny captcha generator. Renders a 5-char text into a PNG and returns
(text, png_bytes). Not a real captcha (no distortion), just enough that the HIL
human has to read something off the screen."""
from __future__ import annotations

import random
import string
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont


_ALPHABET = string.ascii_uppercase + string.digits


def _font() -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype("arial.ttf", 32)
    except OSError:
        return ImageFont.load_default()


def make_captcha(length: int = 5) -> tuple[str, bytes]:
    text = "".join(random.choices(_ALPHABET, k=length))
    img = Image.new("RGB", (200, 60), color=(238, 232, 213))
    draw = ImageDraw.Draw(img)
    for _ in range(50):
        x = random.randint(0, 199)
        y = random.randint(0, 59)
        draw.point((x, y), fill=(180, 175, 160))
    font = _font()
    draw.text((24, 12), text, font=font, fill=(40, 40, 40))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return text, buf.getvalue()
