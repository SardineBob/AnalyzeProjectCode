"""
進度追蹤模組
用於追蹤和回報分析進度
"""
from typing import Optional, Callable
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ProgressUpdate:
    """進度更新資料"""
    stage: str  # 階段名稱：'code_analysis', 'git_analysis', 'processing'
    current: int  # 當前進度
    total: int  # 總數
    message: str  # 詳細訊息
    timestamp: str  # 時間戳記


class ProgressTracker:
    """進度追蹤器"""

    def __init__(self, callback: Optional[Callable] = None):
        """
        初始化進度追蹤器

        Args:
            callback: 進度更新回調函數
        """
        self.callback = callback
        self.current_stage = None
        self.updates = []

    def update(self, stage: str, current: int, total: int, message: str):
        """
        更新進度

        Args:
            stage: 階段名稱
            current: 當前進度
            total: 總數
            message: 詳細訊息
        """
        progress = ProgressUpdate(
            stage=stage,
            current=current,
            total=total,
            message=message,
            timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        )

        self.current_stage = stage
        self.updates.append(progress)

        # 呼叫回調函數
        if self.callback:
            self.callback(progress)

    def get_percentage(self, current: int, total: int) -> int:
        """計算百分比"""
        if total == 0:
            return 0
        return int((current / total) * 100)
