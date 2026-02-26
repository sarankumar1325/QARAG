# Utils package

import re
from typing import List


def detect_urls(message: str) -> List[str]:
    """Extract URLs from a text message."""
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    return re.findall(url_pattern, message)
