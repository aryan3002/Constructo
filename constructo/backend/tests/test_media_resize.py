"""The chat/share upload downsizes photos so the mobile feed serves small images
(fast load, no big-image memory crash). Pure unit test of the resize helper."""

from io import BytesIO

from PIL import Image

from app.chat.router import _downsize_image


def _jpeg(size: tuple[int, int]) -> bytes:
    buf = BytesIO()
    Image.new("RGB", size, (120, 130, 140)).save(buf, "JPEG", quality=95)
    return buf.getvalue()


def test_downsize_shrinks_large_photo():
    original = _jpeg((4000, 3000))  # a phone photo
    resized = _downsize_image(original)
    assert len(resized) < len(original)  # smaller bytes
    out = Image.open(BytesIO(resized))
    assert max(out.size) <= 1600  # capped dimension
    assert out.size == (1600, 1200)  # aspect ratio preserved


def test_downsize_leaves_small_image_untouched():
    original = _jpeg((800, 600))  # already small
    resized = _downsize_image(original)
    # never grows a file — returns the original when re-encoding wouldn't help
    assert len(resized) <= len(original)


def test_downsize_returns_original_on_bad_bytes():
    junk = b"not an image at all"
    assert _downsize_image(junk) == junk  # best-effort: never breaks the upload
