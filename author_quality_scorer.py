"""
作者修改品質評分模組
基於 Git commit 行為評估作者的修改品質
"""
from typing import Dict, Any, List


class AuthorQualityScorer:
    """作者品質評分器"""

    def __init__(self):
        """初始化評分器"""
        pass

    def calculate_scores(self, author_quality_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        計算所有作者的品質評分

        Args:
            author_quality_data: 作者品質資料（來自 GitAnalyzer）

        Returns:
            作者評分列表（包含各維度分數和總分）
        """
        scored_authors = []

        for author, data in author_quality_data.items():
            # 計算各維度分數
            commit_behavior_score = self._score_commit_behavior(data)
            quality_and_scope_score = self._score_quality_and_scope(data)
            activity_score = self._score_activity(data)

            # 計算總分
            total_score = commit_behavior_score + quality_and_scope_score + activity_score

            # 判定等級
            grade = self._determine_grade(total_score)

            scored_authors.append({
                'author': author,
                'total_score': round(total_score, 1),
                'grade': grade,
                'scores': {
                    'commit_behavior': round(commit_behavior_score, 1),
                    'quality_and_scope': round(quality_and_scope_score, 1),
                    'activity': round(activity_score, 1)
                },
                'metrics': data
            })

        # 按總分排序
        scored_authors.sort(key=lambda x: x['total_score'], reverse=True)

        return scored_authors

    def _score_commit_behavior(self, data: Dict[str, Any]) -> float:
        """
        評分：Commit 行為品質（40分）

        Args:
            data: 作者資料

        Returns:
            Commit 行為品質分數（0-40）
        """
        score = 0.0

        # 1. 平均每 commit 修改檔案數（20分，從15分提升）
        # 考量：一般是一個功能/模組 = 一個檔案，新增功能可能涉及多個檔案（介面、類別、物件）
        avg_files = data.get('avg_files_per_commit', 0)
        if 1 <= avg_files <= 3:
            score += 20  # 最佳（一般維護或小功能）
        elif (3 < avg_files <= 6):
            score += 18  # 優秀（新增功能含多個檔案）
        elif (0.5 <= avg_files < 1) or (6 < avg_files <= 10):
            score += 15  # 良好
        elif (10 < avg_files <= 15):
            score += 10  # 普通（可能是較大功能或重構）
        else:
            score += 5   # 需改善（過於碎片或散彈式修改）

        # 2. 最近活躍度（5分，從15分降低）
        # 考量：專案可能有開發期/維護期，不應過度懲罰維護期專案
        days_since_last = data.get('days_since_last_commit', 999)
        if days_since_last <= 30:
            score += 5   # 最近活躍（30天內有 commit）
        elif days_since_last <= 90:
            score += 3   # 間歇活躍（90天內有 commit）
        else:
            score += 1   # 長期沒活動（超過90天）

        # 3. Commit message 品質（15分，從10分提升）
        avg_msg_length = data.get('avg_message_length', 0)
        if avg_msg_length >= 20:
            score += 15  # 最佳
        elif avg_msg_length >= 10:
            score += 11  # 良好
        else:
            score += 5   # 需改善

        return min(score, 40.0)  # 確保不超過40分

    def _score_quality_and_scope(self, data: Dict[str, Any]) -> float:
        """
        評分：工作品質與範圍（30分）

        Args:
            data: 作者資料

        Returns:
            工作品質與範圍分數（0-30）
        """
        score = 0.0

        # 1. 修改範圍廣度（8分）- 修改不同檔案數量
        files_modified = data.get('files_modified', 0)
        if files_modified >= 50:
            score += 8   # 廣泛
        elif files_modified >= 30:
            score += 7   # 良好
        elif files_modified >= 15:
            score += 5   # 普通
        elif files_modified >= 5:
            score += 3   # 範圍較窄
        else:
            score += 1   # 專注於少數檔案

        # 2. 程式碼變動規模（7分）- 總插入+刪除行數
        total_changes = data.get('total_code_changes', 0)
        if total_changes >= 10000:
            score += 7   # 大規模變動
        elif total_changes >= 5000:
            score += 6   # 中等規模
        elif total_changes >= 2000:
            score += 4   # 一般規模
        elif total_changes >= 500:
            score += 2   # 小規模
        else:
            score += 1   # 微小變動

        # 3. 修改品質穩定性（15分）⭐ 核心指標
        # 評估短時間內反覆修改同一檔案的比例
        rapid_rework_ratio = data.get('rapid_rework_ratio', 0)
        if rapid_rework_ratio <= 10:
            score += 15  # 優秀品質（快速返工比例 <= 10%）
        elif rapid_rework_ratio <= 20:
            score += 12  # 良好品質
        elif rapid_rework_ratio <= 30:
            score += 9   # 普通品質
        elif rapid_rework_ratio <= 50:
            score += 5   # 需改善
        else:
            score += 2   # 品質問題嚴重（快速返工比例 > 50%）

        return min(score, 30.0)  # 確保不超過30分

    def _score_activity(self, data: Dict[str, Any]) -> float:
        """
        評分：活躍度與影響力（30分）

        Args:
            data: 作者資料

        Returns:
            活躍度分數（0-30）
        """
        score = 0.0

        # 1. 修改檔案總數（10分）
        files_modified = data.get('files_modified', 0)
        if files_modified >= 50:
            score += 10  # 廣泛影響
        elif files_modified >= 30:
            score += 8   # 良好
        elif files_modified >= 10:
            score += 6   # 普通
        else:
            score += 3   # 較少

        # 2. 活躍時間跨度（10分）
        active_days = data.get('active_days', 0)
        if active_days >= 180:     # 半年以上
            score += 10
        elif active_days >= 90:    # 3個月以上
            score += 8
        elif active_days >= 30:    # 1個月以上
            score += 6
        else:
            score += 3

        # 3. 專案貢獻比例（10分）
        contribution_ratio = data.get('contribution_ratio', 0)
        if contribution_ratio >= 30:
            score += 10  # 核心貢獻者
        elif contribution_ratio >= 15:
            score += 8   # 主要貢獻者
        elif contribution_ratio >= 5:
            score += 6   # 一般貢獻者
        else:
            score += 3   # 偶爾貢獻

        return min(score, 30.0)  # 確保不超過30分

    def _determine_grade(self, total_score: float) -> str:
        """
        根據總分判定等級

        Args:
            total_score: 總分

        Returns:
            等級（S/A/B/C/D）
        """
        if total_score >= 90:
            return 'S'
        elif total_score >= 80:
            return 'A'
        elif total_score >= 70:
            return 'B'
        elif total_score >= 60:
            return 'C'
        else:
            return 'D'

    def get_grade_description(self, grade: str) -> str:
        """
        取得等級描述

        Args:
            grade: 等級

        Returns:
            等級描述
        """
        descriptions = {
            'S': '卓越 - 優秀的程式碼品質與工作習慣',
            'A': '優秀 - 良好的程式碼品質與穩定的貢獻',
            'B': '良好 - 符合團隊標準，有改善空間',
            'C': '普通 - 建議加強程式碼習慣與規範',
            'D': '需改善 - 需要指導與協助'
        }
        return descriptions.get(grade, '未知')
