"""Media path normalization: tolerate file://, absolute, and bare-relative refs."""
from app.config import settings
from app.extraction.extract import _normalize_media_ref


def test_none_passthrough():
    assert _normalize_media_ref(None) is None


def test_absolute_path_passthrough():
    assert _normalize_media_ref("/var/media/abc.jpg") == "/var/media/abc.jpg"


def test_file_uri_stripped():
    assert _normalize_media_ref("file:///var/media/abc.jpg") == "/var/media/abc.jpg"


def test_http_url_passthrough():
    url = "https://cdn.example.com/x.jpg"
    assert _normalize_media_ref(url) == url


def test_bare_relative_resolved_against_media_dir(monkeypatch):
    monkeypatch.setattr(settings, "media_dir", "/shared/media")
    assert _normalize_media_ref("abc.jpg") == "/shared/media/abc.jpg"
