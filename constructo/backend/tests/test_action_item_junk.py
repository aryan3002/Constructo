"""is_meeting_chatter: catches meeting/call invites, NOT real construction tasks."""
import pytest

from app.action_items.junk import is_meeting_chatter

MEETING = [
    "connect via the Google Meet link",
    "Kindly join the meeting at 4pm",
    "We would like to schedule a Google Meet session",
    "Meeting link: https://meet.google.com/abc",
    "Please verify the meeting notes",
    "Join the Zoom call",
    "Reschedule the meeting to tomorrow",
]

# Real site tasks that must NEVER be treated as meeting chatter (the over-match
# the review flagged: bare "zoom", "connect to/via" in plumbing/electrical).
REAL_TASKS = [
    "connect the drain to the main line",
    "connect via PVC pipe to the overhead tank",
    "zoom in on the crack photo and share",
    "schedule the concrete pour for Friday",
    "Ramesh ko bolo cement order kare",
    "verify the granite margin on the sill",
]


@pytest.mark.parametrize("text", MEETING)
def test_meeting_chatter_caught(text):
    assert is_meeting_chatter(text) is True


@pytest.mark.parametrize("text", REAL_TASKS)
def test_real_task_not_chatter(text):
    assert is_meeting_chatter(text) is False
