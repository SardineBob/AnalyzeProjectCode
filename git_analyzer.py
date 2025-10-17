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
                 filter_authors: List[str] = None,
                 start_commit: str = None, end_commit: str = None, progress_tracker=None):
        """
        初始化 Git 分析器

        Args:
            project_path: 專案資料夾路徑
            exclude_files: 排除的檔案名稱列表
            filter_authors: 指定的作者名稱列表（空則顯示全部作者）
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
        self.filter_authors = filter_authors or []
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

        # 作者品質評估相關資料
        author_commit_details = defaultdict(list)  # 每個作者的 commit 詳細資訊
        author_file_changes = defaultdict(lambda: defaultdict(int))  # 每個作者修改各檔案的次數
        author_file_timeline = defaultdict(lambda: defaultdict(list))  # 每個作者對每個檔案的修改時間軸

        # 建立 commit 範圍
        commit_range = self._build_commit_range()

        # 先計算總 commit 數（用於進度顯示）
        commits_list = list(self.repo.iter_commits(commit_range, max_count=max_commits))
        total_commits = len(commits_list)

        # 遍歷 commits
        for commit in commits_list:
            author_name = commit.author.name

            # 如果有指定作者過濾，只處理指定的作者
            if self.filter_authors and not self._is_filtered_author(author_name):
                continue

            commit_count += 1
            authors.add(author_name)
            author_commits[author_name] += 1

            # 記錄時間軸上的活躍度（按月份統計）
            commit_date = datetime.fromtimestamp(commit.committed_date)
            month_key = commit_date.strftime('%Y-%m')
            author_timeline[author_name][month_key] += 1

            # 統計每個 commit 的檔案變更
            commit_files = []  # 本次 commit 涉及的檔案
            if commit.parents:
                parent = commit.parents[0]
                diffs = parent.diff(commit)

                for diff in diffs:
                    # a_path 是舊檔案路徑，b_path 是新檔案路徑
                    file_path = diff.b_path if diff.b_path else diff.a_path
                    if file_path and not self._is_excluded_file(file_path):
                        file_changes[file_path] += 1
                        commit_files.append(file_path)
                        # 記錄該作者修改此檔案
                        author_file_changes[author_name][file_path] += 1
                        # 記錄該作者對此檔案的修改時間軸
                        author_file_timeline[author_name][file_path].append({
                            'timestamp': commit.committed_date,
                            'commit_hash': commit.hexsha[:7]
                        })

                # 統計新增/刪除行數
                try:
                    stats = commit.stats.total
                    total_insertions += stats.get('insertions', 0)
                    total_deletions += stats.get('deletions', 0)
                except:
                    pass

            # 記錄該作者的 commit 詳細資訊（用於品質評估）
            author_commit_details[author_name].append({
                'timestamp': commit.committed_date,
                'message': commit.message.strip(),
                'files_count': len(commit_files),
                'files': commit_files
            })

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

        # 整理作者品質評估資料
        author_quality_data = self._prepare_author_quality_data(
            author_commit_details,
            author_file_changes,
            author_file_timeline,
            file_changes,
            commit_count,
            total_insertions,
            total_deletions
        )

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
            'developer_activity': developer_activity,
            'author_quality_data': author_quality_data
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
            #if exclude_normalized in normalized_path:
            #    return True
            # 3. 路徑結尾匹配（例如 "/config.json" 匹配 "src/config.json"）
            #if normalized_path.endswith(exclude_normalized):
            #    return True

        return False

    def _is_filtered_author(self, author_name: str) -> bool:
        """
        檢查作者是否在指定的過濾列表中

        Args:
            author_name: 作者名稱

        Returns:
            True 如果該作者在過濾列表中（應該被包含）
        """
        if not self.filter_authors:
            return True  # 沒有指定過濾，所有作者都包含

        # 檢查作者名稱是否在過濾列表中（不區分大小寫）
        author_name_lower = author_name.lower().strip()
        for filter_author in self.filter_authors:
            filter_author = filter_author.strip()
            if not filter_author:
                continue

            # 不區分大小寫的完整匹配
            if filter_author.lower() == author_name_lower:
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

    def _prepare_author_quality_data(self, author_commit_details: Dict[str, List[Dict]],
                                      author_file_changes: Dict[str, Dict[str, int]],
                                      author_file_timeline: Dict[str, Dict[str, List[Dict]]],
                                      all_file_changes: Dict[str, int],
                                      total_commits: int,
                                      total_insertions: int,
                                      total_deletions: int) -> Dict[str, Any]:
        """
        準備作者品質評估所需的資料

        Args:
            author_commit_details: 每個作者的 commit 詳細資訊
            author_file_changes: 每個作者修改各檔案的次數
            author_file_timeline: 每個作者對每個檔案的修改時間軸
            all_file_changes: 所有檔案的異動次數
            total_commits: 總 commit 數
            total_insertions: 總插入行數
            total_deletions: 總刪除行數

        Returns:
            作者品質評估資料
        """
        author_data = {}

        for author, commits in author_commit_details.items():
            if not commits:
                continue

            # 排序 commits 按時間
            sorted_commits = sorted(commits, key=lambda x: x['timestamp'])

            # 計算時間跨度（天數）
            first_commit_time = sorted_commits[0]['timestamp']
            last_commit_time = sorted_commits[-1]['timestamp']
            active_days = max(1, (last_commit_time - first_commit_time) / 86400)  # 轉換為天數

            # 計算平均每 commit 修改檔案數
            total_files_in_commits = sum(c['files_count'] for c in commits)
            avg_files_per_commit = total_files_in_commits / len(commits) if len(commits) > 0 else 0

            # 計算平均 commit message 長度
            avg_message_length = sum(len(c['message']) for c in commits) / len(commits) if len(commits) > 0 else 0

            # 計算平均 commit 間隔（天）
            avg_commit_interval = active_days / len(commits) if len(commits) > 1 else active_days

            # 計算距離最近一次 commit 的天數（用於活躍度評估）
            import time
            current_time = time.time()
            days_since_last_commit = (current_time - last_commit_time) / 86400

            # 計算該作者修改的檔案數
            files_modified = len(author_file_changes[author])

            # 計算檔案修改集中度（Top 10 檔案佔比）
            author_files = author_file_changes[author]
            sorted_author_files = sorted(author_files.values(), reverse=True)
            top_10_changes = sum(sorted_author_files[:10]) if len(sorted_author_files) > 0 else 0
            total_author_changes = sum(sorted_author_files) if len(sorted_author_files) > 0 else 1
            file_concentration = (top_10_changes / total_author_changes * 100) if total_author_changes > 0 else 0

            # 計算熱點檔案參與度（修改 Top 20% 高異動檔案的次數）
            total_files = len(all_file_changes)
            top_20_percent_count = max(1, int(total_files * 0.2))
            top_hotspot_files = set(sorted(all_file_changes.keys(), key=lambda x: all_file_changes[x], reverse=True)[:top_20_percent_count])

            hotspot_changes = sum(1 for f in author_files.keys() if f in top_hotspot_files)
            hotspot_participation = (hotspot_changes / files_modified * 100) if files_modified > 0 else 0

            # 計算專案貢獻比例
            contribution_ratio = (len(commits) / total_commits * 100) if total_commits > 0 else 0

            # 計算程式碼變動量（該作者的總插入+刪除行數）
            author_total_changes = 0
            for commit in commits:
                # 注意：這裡我們只能用全域的 total_insertions/deletions 來估算
                # 實際上需要在 analyze() 中記錄每個作者的 insertions/deletions
                pass
            # 暫時使用作者的 commit 比例來估算
            author_insertions = int(total_insertions * (len(commits) / total_commits)) if total_commits > 0 else 0
            author_deletions = int(total_deletions * (len(commits) / total_commits)) if total_commits > 0 else 0
            author_total_changes = author_insertions + author_deletions

            # 計算快速返工比例（5天內反覆修改同一檔案）
            rapid_rework_count = 0  # 5天內的快速修改次數
            total_file_modifications = 0  # 總修改次數（計算間隔用）

            # 對該作者修改的每個檔案分析時間軸
            for file_path, timeline in author_file_timeline[author].items():
                if len(timeline) <= 1:
                    # 只改過1次，不計入
                    continue

                # 按時間排序
                sorted_timeline = sorted(timeline, key=lambda x: x['timestamp'])

                # 計算連續修改之間的時間間隔
                for i in range(len(sorted_timeline) - 1):
                    days_diff = (sorted_timeline[i+1]['timestamp'] - sorted_timeline[i]['timestamp']) / 86400
                    total_file_modifications += 1

                    # 5天內視為快速返工（同一天也算，因為可能是測試發現問題）
                    if days_diff <= 5:
                        rapid_rework_count += 1

            # 計算快速返工比例
            rapid_rework_ratio = (rapid_rework_count / total_file_modifications * 100) if total_file_modifications > 0 else 0

            author_data[author] = {
                'total_commits': len(commits),
                'files_modified': files_modified,
                'active_days': round(active_days, 1),
                'avg_files_per_commit': round(avg_files_per_commit, 2),
                'avg_message_length': round(avg_message_length, 1),
                'avg_commit_interval': round(avg_commit_interval, 2),
                'days_since_last_commit': round(days_since_last_commit, 1),
                'file_concentration': round(file_concentration, 1),
                'hotspot_participation': round(hotspot_participation, 1),
                'contribution_ratio': round(contribution_ratio, 1),
                'total_code_changes': author_total_changes,
                'rapid_rework_ratio': round(rapid_rework_ratio, 1),
                'rapid_rework_count': rapid_rework_count,
                'total_file_modifications': total_file_modifications
            }

        return author_data

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
