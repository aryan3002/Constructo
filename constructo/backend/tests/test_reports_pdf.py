"""Smoke test: WeasyPrint can render a minimal PDF."""


def test_weasyprint_renders_minimal_pdf():
    from weasyprint import HTML

    pdf = HTML(string="<h1>hello</h1>").write_pdf()
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 500
