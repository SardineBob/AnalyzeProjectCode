"""
程式碼分析模組
使用 Lizard 分析專案程式碼的行數、檔案數量、複雜度等指標
"""
import os
import lizard
from typing import Dict, List, Any
from pathlib import Path


class CodeAnalyzer:
    """程式碼分析器"""

    # 預設排除的資料夾
    DEFAULT_EXCLUDE_FOLDERS = [
        "node_modules", "venv", ".git", "dist", "build",
        "__pycache__", ".venv", "env", ".idea", ".vscode"
    ]

    # 預設排除的檔案名稱
    DEFAULT_EXCLUDE_FILES = [
        "min.js", "jquery", "knockout", "sockjs", "bootstrap",
        "moment", "api.js", ".worker.js"
    ]

    def __init__(self, project_path: str, exclude_folders: List[str] = None,
                 exclude_files: List[str] = None):
        """
        初始化程式碼分析器

        Args:
            project_path: 專案資料夾路徑
            exclude_folders: 自訂排除的資料夾列表，如果為 None 則使用預設值
            exclude_files: 自訂排除的檔案列表（檔案名稱或路徑）
        """
        self.project_path = Path(project_path)
        if not self.project_path.exists():
            raise ValueError(f"專案路徑不存在: {project_path}")

        # 合併預設和自訂排除資料夾
        if exclude_folders is None:
            self.exclude_folders = self.DEFAULT_EXCLUDE_FOLDERS.copy()
        else:
            self.exclude_folders = self.DEFAULT_EXCLUDE_FOLDERS.copy()
            self.exclude_folders.extend(exclude_folders)

        # 合併預設和自訂排除檔案名稱
        if exclude_files is None:
            self.exclude_files = self.DEFAULT_EXCLUDE_FILES.copy()
        else:
            self.exclude_files = self.DEFAULT_EXCLUDE_FILES.copy()
            self.exclude_files.extend(exclude_files)

    def analyze(self) -> Dict[str, Any]:
        """
        分析專案程式碼

        Returns:
            包含分析結果的字典
        """
        # 使用 Lizard 分析專案
        # 改進：使用絕對路徑並遞迴分析所有子目錄
        analysis = lizard.analyze(
            paths=[str(self.project_path.absolute())],
            exclude_pattern=r"(?:^|[\\/])(node_modules|\.git|__pycache__|dist|build|env|\.idea|\.vscode)(?:[\\/]|$)",  # 只保留最基本的排除
            exts=lizard.get_extensions([])  # 支援所有語言
        )

        # 統計資訊
        total_lines = 0
        total_nloc = 0  # 非空白行數
        total_files = 0
        total_functions = 0
        complexity_sum = 0
        max_complexity = 0
        max_complexity_function = None

        file_details = []

        for file_info in analysis:
            # 檢查是否應該排除此檔案（排除資料夾和排除檔案）
            if self._is_excluded_file(file_info.filename) or self._is_excluded_folder(file_info.filename):
                continue

            total_files += 1
            total_lines += file_info.nloc
            total_nloc += file_info.nloc

            file_complexity = 0
            file_functions = len(file_info.function_list)
            total_functions += file_functions

            for func in file_info.function_list:
                complexity_sum += func.cyclomatic_complexity
                file_complexity += func.cyclomatic_complexity

                if func.cyclomatic_complexity > max_complexity:
                    max_complexity = func.cyclomatic_complexity
                    max_complexity_function = {
                        'name': func.name,
                        'file': file_info.filename,
                        'complexity': func.cyclomatic_complexity,
                        'line': func.start_line
                    }

            # 檔案詳細資訊
            file_details.append({
                'filename': os.path.relpath(file_info.filename, self.project_path),
                'nloc': file_info.nloc,
                'functions': file_functions,
                'complexity': file_complexity,
                'avg_complexity': round(file_complexity / file_functions, 2) if file_functions > 0 else 0
            })

        # 計算平均複雜度
        avg_complexity = round(complexity_sum / total_functions, 2) if total_functions > 0 else 0

        # 依複雜度排序檔案
        file_details_sorted = sorted(file_details, key=lambda x: x['complexity'], reverse=True)

        return {
            'summary': {
                'total_files': total_files,
                'total_lines': total_lines,
                'total_nloc': total_nloc,
                'total_functions': total_functions,
                'avg_complexity': avg_complexity,
                'max_complexity': max_complexity,
                'max_complexity_function': max_complexity_function
            },
            'files': file_details_sorted[:50],  # 只返回前50個最複雜的檔案
            'complexity_distribution': self._get_complexity_distribution(file_details)
        }

    def _is_excluded_folder(self, file_path: str) -> bool:
        """
        檢查檔案路徑是否包含應該被排除的資料夾

        Args:
            file_path: 檔案完整路徑

        Returns:
            True 如果該檔案在排除的資料夾中
        """
        if not self.exclude_folders:
            return False

        # 標準化路徑（統一使用正斜線）
        normalized_path = file_path.replace('\\', '/')

        # 將路徑分割成各個部分
        path_parts = normalized_path.split('/')

        # 檢查路徑中是否包含排除的資料夾名稱
        for exclude_folder in self.exclude_folders:
            exclude_folder = exclude_folder.strip()
            if not exclude_folder:
                continue

            # 檢查資料夾名稱是否完整匹配路徑的某一部分
            if exclude_folder in path_parts:
                return True

        return False

    def _is_excluded_file(self, file_path: str) -> bool:
        """
        檢查檔案是否應該被排除

        Args:
            file_path: 檔案完整路徑

        Returns:
            True 如果該檔案應該被排除
        """
        if not self.exclude_files:
            return False

        # 取得檔案名稱
        file_name = os.path.basename(file_path)

        # 檢查是否在排除列表中
        for exclude in self.exclude_files:
            exclude = exclude.strip()
            if not exclude:
                continue
            # 支援完整檔名匹配或路徑包含匹配
            if exclude == file_name or exclude in file_path:
                return True

        return False

    def _get_complexity_distribution(self, file_details: List[Dict]) -> Dict[str, int]:
        """
        計算複雜度分佈

        Args:
            file_details: 檔案詳細資訊列表

        Returns:
            複雜度分佈統計
        """
        distribution = {
            'low': 0,       # 複雜度 1-5
            'medium': 0,    # 複雜度 6-10
            'high': 0,      # 複雜度 11-20
            'very_high': 0  # 複雜度 > 20
        }

        for file_info in file_details:
            complexity = file_info['avg_complexity']
            if complexity <= 5:
                distribution['low'] += 1
            elif complexity <= 10:
                distribution['medium'] += 1
            elif complexity <= 20:
                distribution['high'] += 1
            else:
                distribution['very_high'] += 1

        return distribution
