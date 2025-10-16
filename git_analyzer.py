"""
Git Log 分析模組
分析 Git 版本控制歷史，統計檔案異動次數
"""
import os
from typing import Dict, List, Any, Optional
from pathlib import Path
from git import Repo, InvalidGitRepositoryError
from collections import defaultdict
from datetime import datetime


class GitAnalyzer:
    """Git 歷史分析器"""

    def __init__(self, project_path: str, exclude_files: List[str] = None,
                 start_commit: str = None, end_commit: str = None, progress_tracker=None):
        """
        初始化 Git 分析器

        Args:
            project_path: 專案資料夾路徑
            exclude_files: 排除的檔案名稱列表
            start_commit: 起始 commit ID（較舊的節點）
            end_commit: 結束 commit ID（較新的節點）
            progress_tracker: 進度追蹤器實例
        """
        self.project_path = Path(project_path)
        if not self.project_path.exists():
            raise ValueError(f"專案路徑不存在: {project_path}")

        try:
            self.repo = Repo(project_path)
        except InvalidGitRepositoryError:
            raise ValueError(f"該路徑不是有效的 Git 倉庫: {project_path}")

        self.exclude_files = exclude_files or []
        self.start_commit = start_commit
        self.end_commit = end_commit
        self.progress_tracker = progress_tracker

    def analyze(self, max_commits: int = 1000) -> Dict[str, Any]:
        """
        分析 Git 歷史

        Args:
            max_commits: 最多分析的 commit 數量

        Returns:
            包含分析結果的字典
        """
        # 統計檔案異動次數
        file_changes = defaultdict(int)
        commit_count = 0
        authors = set()
        author_commits = defaultdict(int)  # 每個作者的 commit 數
        author_timeline = defaultdict(lambda: defaultdict(int))  # 時間軸上的活躍度
        total_insertions = 0
        total_deletions = 0

        # 建立 commit 範圍
        commit_range = self._build_commit_range()

        # 先計算總 commit 數（用於進度顯示）
        commits_list = list(self.repo.iter_commits(commit_range, max_count=max_commits))
        total_commits = len(commits_list)

        # 遍歷 commits
        for commit in commits_list:
            commit_count += 1
            author_name = commit.author.name
            authors.add(author_name)
            author_commits[author_name] += 1

            # 記錄時間軸上的活躍度（按月份統計）
            commit_date = datetime.fromtimestamp(commit.committed_date)
            month_key = commit_date.strftime('%Y-%m')
            author_timeline[author_name][month_key] += 1

            # 統計每個 commit 的檔案變更
            if commit.parents:
                parent = commit.parents[0]
                diffs = parent.diff(commit)

                for diff in diffs:
                    # a_path 是舊檔案路徑，b_path 是新檔案路徑
                    file_path = diff.b_path if diff.b_path else diff.a_path
                    if file_path and not self._is_excluded_file(file_path):
                        file_changes[file_path] += 1

                # 統計新增/刪除行數
                try:
                    stats = commit.stats.total
                    total_insertions += stats.get('insertions', 0)
                    total_deletions += stats.get('deletions', 0)
                except:
                    pass

            # 更新進度
            if self.progress_tracker:
                # 每處理20個commits或最後一個commit時更新
                if commit_count % 20 == 0 or commit_count == total_commits:
                    progress_percentage = int(55 + (commit_count / total_commits * 40))  # 55-95%
                    self.progress_tracker.update(
                        "git_analysis",
                        progress_percentage,
                        100,
                        f"正在分析 Git 歷史... ({commit_count}/{total_commits} commits)"
                    )

        # 排序檔案異動次數（由多到少）
        sorted_files = sorted(
            file_changes.items(),
            key=lambda x: x[1],
            reverse=True
        )

        # 取前 50 個最常異動的檔案
        top_changed_files = [
            {
                'filename': file_path,
                'changes': count
            }
            for file_path, count in sorted_files[:50]
        ]

        # 檔案異動頻率分佈
        change_distribution = self._get_change_distribution(file_changes)

        # 處理開發者活躍度資料
        developer_activity = self._process_developer_activity(author_commits, author_timeline)

        return {
            'summary': {
                'total_commits': commit_count,
                'total_authors': len(authors),
                'total_files_changed': len(file_changes),
                'total_insertions': total_insertions,
                'total_deletions': total_deletions,
                'authors': list(authors)
            },
            'top_changed_files': top_changed_files,
            'change_distribution': change_distribution,
            'developer_activity': developer_activity
        }

    def _get_change_distribution(self, file_changes: Dict[str, int]) -> Dict[str, int]:
        """
        計算檔案異動頻率分佈

        Args:
            file_changes: 檔案異動次數字典

        Returns:
            異動頻率分佈統計
        """
        distribution = {
            'low': 0,       # 1-5 次
            'medium': 0,    # 6-15 次
            'high': 0,      # 16-30 次
            'very_high': 0  # > 30 次
        }

        for count in file_changes.values():
            if count <= 5:
                distribution['low'] += 1
            elif count <= 15:
                distribution['medium'] += 1
            elif count <= 30:
                distribution['high'] += 1
            else:
                distribution['very_high'] += 1

        return distribution

    def _build_commit_range(self) -> str:
        """
        建立 commit 範圍字串

        Returns:
            commit 範圍字串，格式為 "start_commit..end_commit" 或 "HEAD"
        """
        if self.start_commit and self.end_commit:
            # 指定範圍：從舊到新
            return f"{self.start_commit}..{self.end_commit}"
        elif self.start_commit:
            # 只有起始點，從起始點到最新
            return f"{self.start_commit}..HEAD"
        elif self.end_commit:
            # 只有結束點，從頭到結束點
            return self.end_commit
        else:
            # 沒有指定範圍，分析所有 commits
            return "HEAD"

    def _is_excluded_file(self, file_path: str) -> bool:
        """
        檢查檔案是否應該被排除

        Args:
            file_path: 檔案路徑

        Returns:
            True 如果該檔案應該被排除
        """
        if not self.exclude_files:
            return False

        # 標準化路徑（統一使用正斜線）
        normalized_path = file_path.replace('\\', '/')
        file_name = os.path.basename(normalized_path)

        # 檢查是否在排除列表中
        for exclude in self.exclude_files:
            exclude = exclude.strip()
            if not exclude:
                continue

            # 標準化排除規則
            exclude_normalized = exclude.replace('\\', '/')

            # 支援三種匹配方式：
            # 1. 完整檔名匹配
            if exclude_normalized == file_name:
                return True
            # 2. 路徑包含匹配（支援部分路徑）
            if exclude_normalized in normalized_path:
                return True
            # 3. 路徑結尾匹配（例如 "/config.json" 匹配 "src/config.json"）
            if normalized_path.endswith(exclude_normalized):
                return True

        return False

    def _process_developer_activity(self, author_commits: Dict[str, int],
                                     author_timeline: Dict[str, Dict[str, int]]) -> Dict[str, Any]:
        """
        處理開發者活躍度資料

        Args:
            author_commits: 每個作者的 commit 總數
            author_timeline: 每個作者在時間軸上的 commit 數

        Returns:
            開發者活躍度統計資料
        """
        # 排序作者按 commit 數量
        sorted_authors = sorted(author_commits.items(), key=lambda x: x[1], reverse=True)

        # 收集所有時間點
        all_months = set()
        for timeline in author_timeline.values():
            all_months.update(timeline.keys())
        all_months = sorted(list(all_months))

        # 構建每個作者的時間序列資料
        timeline_data = []
        for author, commits in sorted_authors:
            author_data = {
                'author': author,
                'total_commits': commits,
                'timeline': [author_timeline[author].get(month, 0) for month in all_months]
            }
            timeline_data.append(author_data)

        return {
            'months': all_months,
            'authors': timeline_data
        }

    def get_recent_commits(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        取得最近的 commits

        Args:
            limit: 取得的 commit 數量

        Returns:
            最近的 commits 資訊列表
        """
        commits = []
        for commit in self.repo.iter_commits(max_count=limit):
            commits.append({
                'hash': commit.hexsha[:7],
                'author': commit.author.name,
                'date': commit.committed_datetime.strftime('%Y-%m-%d %H:%M:%S'),
                'message': commit.message.strip()
            })

        return commits
