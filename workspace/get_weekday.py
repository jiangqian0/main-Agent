#!/usr/bin/env python3
from datetime import datetime

now = datetime.now()
weekday = now.strftime('%A')
date_str = now.strftime('%Y-%m-%d')
print(f"今天是 {date_str}，星期{weekday}")
