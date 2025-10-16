"""
設定管理模組
負責儲存和載入使用者的分析設定
"""
import json
import sys
import os
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime


class ConfigManager:
    """設定管理器"""

    def __init__(self, config_file: str = "user_config.json"):
        """
        初始化設定管理器

        Args:
            config_file: 設定檔案名稱
        """
        # 取得執行檔所在目錄（支援 PyInstaller 打包）
        if getattr(sys, 'frozen', False):
            # 打包後的執行檔，使用執行檔所在目錄
            app_dir = Path(os.path.dirname(sys.executable))
        else:
            # 開發環境，使用腳本所在目錄
            app_dir = Path(__file__).parent

        self.config_path = app_dir / config_file

    def save_config(self, config_data: Dict[str, Any]) -> bool:
        """
        儲存使用者設定

        Args:
            config_data: 設定資料字典

        Returns:
            True 如果儲存成功，False 如果失敗
        """
        try:
            # 加入時間戳記
            config_data['last_updated'] = datetime.now().isoformat()

            # 寫入 JSON 檔案
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, ensure_ascii=False, indent=2)

            return True
        except Exception as e:
            print(f"儲存設定失敗: {e}")
            return False

    def load_config(self) -> Optional[Dict[str, Any]]:
        """
        載入使用者設定

        Returns:
            設定資料字典，如果不存在或載入失敗則返回 None
        """
        try:
            if not self.config_path.exists():
                return None

            with open(self.config_path, 'r', encoding='utf-8') as f:
                config_data = json.load(f)

            return config_data
        except Exception as e:
            print(f"載入設定失敗: {e}")
            return None

    def get_last_config(self) -> Dict[str, Any]:
        """
        取得最後一次的設定，如果不存在則返回預設值

        Returns:
            設定資料字典
        """
        config = self.load_config()
        if config:
            return config

        # 返回預設設定
        return {
            'project_path': '',
            'exclude_folders': [],
            'exclude_code_files': [],
            'exclude_git_files': [],
            'filter_authors': [],
            'start_commit': '',
            'end_commit': '',
            'max_commits': 1000,
            'last_updated': None
        }

    def clear_config(self) -> bool:
        """
        清除儲存的設定

        Returns:
            True 如果清除成功，False 如果失敗
        """
        try:
            if self.config_path.exists():
                self.config_path.unlink()
            return True
        except Exception as e:
            print(f"清除設定失敗: {e}")
            return False
