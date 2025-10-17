// 全域變數
let complexityChartInstance = null;
let changeFrequencyChartInstance = null;
let topChangedFilesChartInstance = null;
let developerActivityChartInstance = null;

// DOM 元素
const analyzeBtn = document.getElementById('analyzeBtn');
const projectPathInput = document.getElementById('projectPath');
const excludeFoldersInput = document.getElementById('excludeFolders');
const excludeCodeFilesInput = document.getElementById('excludeCodeFiles');
const excludeGitFilesInput = document.getElementById('excludeGitFiles');
const filterAuthorsInput = document.getElementById('filterAuthors');
const startCommitInput = document.getElementById('startCommit');
const endCommitInput = document.getElementById('endCommit');
const maxCommitsInput = document.getElementById('maxCommits');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const results = document.getElementById('results');
const gitResults = document.getElementById('gitResults');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const exportPdfBtn = document.getElementById('exportPdfBtn');

// 事件監聽
analyzeBtn.addEventListener('click', analyzeProject);
projectPathInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeProject();
});
exportPdfBtn.addEventListener('click', exportToPdf);

// 頁面載入時讀取上次的設定
document.addEventListener('DOMContentLoaded', loadLastConfig);

// 分析專案
async function analyzeProject() {
    const projectPath = projectPathInput.value.trim();

    if (!projectPath) {
        showError('請輸入專案資料夾路徑');
        return;
    }

    // 收集進階選項
    const excludeFolders = excludeFoldersInput.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const excludeCodeFiles = excludeCodeFilesInput.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const excludeGitFiles = excludeGitFilesInput.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const filterAuthors = filterAuthorsInput.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const startCommit = startCommitInput.value.trim() || null;
    const endCommit = endCommitInput.value.trim() || null;
    const maxCommits = parseInt(maxCommitsInput.value) || 1000;

    // 儲存設定
    await saveCurrentConfig();

    // 顯示載入中
    showLoading();
    hideError();
    results.style.display = 'none';

    // 生成會話 ID
    const sessionId = generateSessionId();

    // 連接進度串流
    const eventSource = connectProgressStream(sessionId);

    try {
        const requestBody = {
            project_path: projectPath,
            session_id: sessionId,
            exclude_folders: excludeFolders.length > 0 ? excludeFolders : null,
            exclude_code_files: excludeCodeFiles.length > 0 ? excludeCodeFiles : null,
            exclude_git_files: excludeGitFiles.length > 0 ? excludeGitFiles : null,
            filter_authors: filterAuthors.length > 0 ? filterAuthors : null,
            start_commit: startCommit,
            end_commit: endCommit,
            max_commits: maxCommits
        };

        const response = await fetch('/api/analyze/all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '分析失敗');
        }

        const result = await response.json();
        displayResults(result.data);
    } catch (error) {
        showError(error.message);
        if (eventSource) {
            eventSource.close();
        }
    } finally {
        hideLoading();
        if (eventSource) {
            eventSource.close();
        }
    }
}

// 生成會話 ID
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// 連接進度串流
function connectProgressStream(sessionId) {
    const eventSource = new EventSource(`/api/progress/${sessionId}`);

    eventSource.onmessage = (event) => {
        const progress = JSON.parse(event.data);
        updateProgressUI(progress);

        // 如果完成或錯誤，關閉連接
        if (progress.stage === 'completed' || progress.stage === 'error') {
            eventSource.close();
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE 連接錯誤:', error);
        eventSource.close();
    };

    return eventSource;
}

// 更新進度 UI
function updateProgressUI(progress) {
    console.log('Progress update:', progress);  // 除錯用

    // 更新進度條
    progressBar.style.width = progress.percentage + '%';
    progressText.textContent = progress.percentage + '%';

    // 根據階段更新主要訊息
    const loadingMessage = document.getElementById('loadingMessage');
    if (progress.stage === 'code_analysis') {
        loadingMessage.textContent = progress.message;
    } else if (progress.stage === 'git_analysis') {
        loadingMessage.textContent = progress.message;
    } else if (progress.stage === 'completed') {
        loadingMessage.textContent = '分析完成！';
    } else if (progress.stage === 'error') {
        loadingMessage.textContent = '分析發生錯誤';
    } else {
        loadingMessage.textContent = progress.message;
    }
}

// 顯示分析結果
function displayResults(data) {
    // 填入設定摘要
    fillConfigSummary();

    // 顯示程式碼分析結果
    if (data.code) {
        displayCodeAnalysis(data.code);
    }

    // 顯示 Git 分析結果
    if (data.git) {
        displayGitAnalysis(data.git);
        gitResults.style.display = 'block';
    } else {
        gitResults.style.display = 'none';
    }

    // 顯示作者品質評分
    if (data.author_quality_scores) {
        displayAuthorQualityScores(data.author_quality_scores);
    }

    results.style.display = 'block';
}

// 顯示程式碼分析結果
function displayCodeAnalysis(data) {
    const summary = data.summary;

    // 更新卡片數據
    document.getElementById('totalFiles').textContent = summary.total_files.toLocaleString();
    document.getElementById('totalLines').textContent = summary.total_lines.toLocaleString();
    document.getElementById('totalFunctions').textContent = summary.total_functions.toLocaleString();
    document.getElementById('avgComplexity').textContent = summary.avg_complexity;

    // 更新複雜度分佈圖表
    displayComplexityChart(data.complexity_distribution);

    // 更新檔案表格
    displayFilesTable(data.files);
}

// 顯示複雜度分佈圖表
function displayComplexityChart(distribution) {
    const ctx = document.getElementById('complexityChart').getContext('2d');

    // 銷毀舊圖表
    if (complexityChartInstance) {
        complexityChartInstance.destroy();
    }

    complexityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['低 (1-5)', '中 (6-10)', '高 (11-20)', '極高 (>20)'],
            datasets: [{
                label: '檔案數量',
                data: [
                    distribution.low,
                    distribution.medium,
                    distribution.high,
                    distribution.very_high
                ],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(255, 99, 132, 0.6)'
                ],
                borderColor: [
                    'rgba(75, 192, 192, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 206, 86, 1)',
                    'rgba(255, 99, 132, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '檔案複雜度分佈',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

// 顯示檔案表格
function displayFilesTable(files) {
    const tbody = document.querySelector('#filesTable tbody');
    tbody.innerHTML = '';

    const topFiles = files.slice(0, 20);
    topFiles.forEach(file => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${escapeHtml(file.filename)}</td>
            <td>${file.nloc.toLocaleString()}</td>
            <td>${file.functions}</td>
            <td>${file.complexity}</td>
            <td>${file.avg_complexity}</td>
        `;
    });
}

// 顯示 Git 分析結果
function displayGitAnalysis(data) {
    const summary = data.summary;

    // 更新卡片數據
    document.getElementById('totalCommits').textContent = summary.total_commits.toLocaleString();
    document.getElementById('totalAuthors').textContent = summary.total_authors.toLocaleString();
    document.getElementById('totalFilesChanged').textContent = summary.total_files_changed.toLocaleString();
    document.getElementById('totalChanges').textContent =
        `+${summary.total_insertions.toLocaleString()} / -${summary.total_deletions.toLocaleString()}`;

    // 更新異動檔案長條圖
    displayTopChangedFilesChart(data.top_changed_files);

    // 更新異動頻率圖表
    displayChangeFrequencyChart(data.change_distribution);

    // 更新異動檔案表格
    displayChangedFilesTable(data.top_changed_files);

    // 顯示開發者活躍度分析
    if (data.developer_activity) {
        displayDeveloperActivityChart(data.developer_activity);
    }
}

// 顯示異動最頻繁的檔案長條圖
function displayTopChangedFilesChart(files) {
    const ctx = document.getElementById('topChangedFilesChart').getContext('2d');

    // 銷毀舊圖表
    if (topChangedFilesChartInstance) {
        topChangedFilesChartInstance.destroy();
    }

    // 取前10個最常異動的檔案
    const topFiles = files.slice(0, 10);
    const labels = topFiles.map(f => {
        const parts = f.filename.split(/[\\/]/);
        return parts[parts.length - 1]; // 只顯示檔案名稱
    });
    const data = topFiles.map(f => f.changes);

    topChangedFilesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '異動次數',
                data: data,
                backgroundColor: 'rgba(102, 126, 234, 0.6)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: true,
                    text: '異動最頻繁的檔案 (Top 10)',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            return topFiles[context[0].dataIndex].filename;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
}

// 顯示異動頻率圖表
function displayChangeFrequencyChart(distribution) {
    const ctx = document.getElementById('changeFrequencyChart').getContext('2d');

    // 銷毀舊圖表
    if (changeFrequencyChartInstance) {
        changeFrequencyChartInstance.destroy();
    }

    changeFrequencyChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['低頻 (1-5次)', '中頻 (6-15次)', '高頻 (16-30次)', '極高頻 (>30次)'],
            datasets: [{
                data: [
                    distribution.low,
                    distribution.medium,
                    distribution.high,
                    distribution.very_high
                ],
                backgroundColor: [
                    'rgba(75, 192, 192, 0.8)',
                    'rgba(54, 162, 235, 0.8)',
                    'rgba(255, 206, 86, 0.8)',
                    'rgba(255, 99, 132, 0.8)'
                ],
                borderColor: 'white',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '檔案異動頻率分佈',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// 顯示異動檔案表格
function displayChangedFilesTable(files) {
    const tbody = document.querySelector('#changedFilesTable tbody');
    tbody.innerHTML = '';

    const topFiles = files.slice(0, 20);
    topFiles.forEach(file => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${escapeHtml(file.filename)}</td>
            <td>${file.changes}</td>
        `;
    });
}

// 顯示開發者活躍度折線圖
function displayDeveloperActivityChart(activity) {
    const ctx = document.getElementById('developerActivityChart').getContext('2d');

    // 銷毀舊圖表
    if (developerActivityChartInstance) {
        developerActivityChartInstance.destroy();
    }

    // 準備資料集
    const colors = [
        'rgba(102, 126, 234, 1)',
        'rgba(118, 75, 162, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(54, 162, 235, 1)',
        'rgba(75, 192, 192, 1)',
        'rgba(255, 206, 86, 1)',
        'rgba(153, 102, 255, 1)',
        'rgba(255, 159, 64, 1)'
    ];

    const datasets = activity.authors.map((author, index) => {
        const color = colors[index % colors.length];
        return {
            label: `${author.author} (${author.total_commits} commits)`,
            data: author.timeline,
            borderColor: color,
            backgroundColor: color.replace('1)', '0.1)'),
            tension: 0.3,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6
        };
    });

    developerActivityChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: activity.months,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                title: {
                    display: true,
                    text: '開發者活躍度時間軸',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: true,
                    position: 'bottom'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    },
                    title: {
                        display: true,
                        text: 'Commits 數量'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '時間（月份）'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

// 工具函數
function showLoading() {
    loadingIndicator.style.display = 'block';
    analyzeBtn.disabled = true;
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
    analyzeBtn.disabled = false;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 載入上次的設定
async function loadLastConfig() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            console.log('沒有找到上次的設定');
            return;
        }

        const result = await response.json();
        const config = result.data;

        // 填入各個欄位
        if (config.project_path) {
            projectPathInput.value = config.project_path;
        }

        if (config.exclude_folders && config.exclude_folders.length > 0) {
            excludeFoldersInput.value = config.exclude_folders.join('\n');
        }

        if (config.exclude_code_files && config.exclude_code_files.length > 0) {
            excludeCodeFilesInput.value = config.exclude_code_files.join('\n');
        }

        if (config.exclude_git_files && config.exclude_git_files.length > 0) {
            excludeGitFilesInput.value = config.exclude_git_files.join('\n');
        }

        if (config.filter_authors && config.filter_authors.length > 0) {
            filterAuthorsInput.value = config.filter_authors.join('\n');
        }

        if (config.start_commit) {
            startCommitInput.value = config.start_commit;
        }

        if (config.end_commit) {
            endCommitInput.value = config.end_commit;
        }

        if (config.max_commits) {
            maxCommitsInput.value = config.max_commits;
        }

        console.log('已載入上次的設定');
    } catch (error) {
        console.error('載入設定失敗:', error);
    }
}

// 儲存當前設定
async function saveCurrentConfig() {
    try {
        const excludeFolders = excludeFoldersInput.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const excludeCodeFiles = excludeCodeFilesInput.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const excludeGitFiles = excludeGitFilesInput.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const filterAuthors = filterAuthorsInput.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        const configData = {
            project_path: projectPathInput.value.trim(),
            exclude_folders: excludeFolders.length > 0 ? excludeFolders : null,
            exclude_code_files: excludeCodeFiles.length > 0 ? excludeCodeFiles : null,
            exclude_git_files: excludeGitFiles.length > 0 ? excludeGitFiles : null,
            filter_authors: filterAuthors.length > 0 ? filterAuthors : null,
            start_commit: startCommitInput.value.trim() || null,
            end_commit: endCommitInput.value.trim() || null,
            max_commits: parseInt(maxCommitsInput.value) || 1000
        };

        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(configData),
        });

        if (response.ok) {
            console.log('設定已儲存');
        } else {
            console.error('儲存設定失敗');
        }
    } catch (error) {
        console.error('儲存設定時發生錯誤:', error);
    }
}

// 填入設定摘要
function fillConfigSummary() {
    // 專案路徑
    document.getElementById('summaryProjectPath').textContent = projectPathInput.value.trim() || '-';

    // 分析時間
    const now = new Date();
    document.getElementById('summaryAnalysisTime').textContent = now.toLocaleString('zh-TW');

    // 排除資料夾
    const excludeFolders = excludeFoldersInput.value.trim();
    document.getElementById('summaryExcludeFolders').textContent =
        excludeFolders ? excludeFolders.split('\n').join(', ') : '無';

    // 排除檔案 (程式碼)
    const excludeCodeFiles = excludeCodeFilesInput.value.trim();
    document.getElementById('summaryExcludeCodeFiles').textContent =
        excludeCodeFiles ? excludeCodeFiles.split('\n').join(', ') : '無';

    // 排除檔案 (Git)
    const excludeGitFiles = excludeGitFilesInput.value.trim();
    document.getElementById('summaryExcludeGitFiles').textContent =
        excludeGitFiles ? excludeGitFiles.split('\n').join(', ') : '無';

    // 指定作者 (Git)
    const filterAuthors = filterAuthorsInput.value.trim();
    document.getElementById('summaryFilterAuthors').textContent =
        filterAuthors ? filterAuthors.split('\n').join(', ') : '全部';

    // Git 起始 Commit
    const startCommit = startCommitInput.value.trim();
    document.getElementById('summaryStartCommit').textContent = startCommit || '最早';

    // Git 結束 Commit
    const endCommit = endCommitInput.value.trim();
    document.getElementById('summaryEndCommit').textContent = endCommit || '最新';

    // 最大 Commit 數
    document.getElementById('summaryMaxCommits').textContent = maxCommitsInput.value || '1000';
}

// 匯出 PDF
function exportToPdf() {
    // 觸發瀏覽器列印功能
    window.print();
}

// 顯示作者品質評分
function displayAuthorQualityScores(scores) {
    if (!scores || scores.length === 0) {
        return;
    }

    const section = document.getElementById('authorQualitySection');
    const tbody = document.querySelector('#authorQualityTable tbody');
    tbody.innerHTML = '';

    // 儲存到全域變數
    window.authorScoresData = scores;

    scores.forEach((authorScore, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${escapeHtml(authorScore.author)}</strong></td>
            <td><strong>${authorScore.total_score}</strong></td>
            <td><span class="grade-badge grade-${authorScore.grade}">${authorScore.grade}</span></td>
            <td>${authorScore.scores.commit_behavior} / 40</td>
            <td>${authorScore.scores.quality_and_scope} / 30</td>
            <td>${authorScore.scores.activity} / 30</td>
            <td><button class="detail-btn" data-index="${index}">詳細</button></td>
        `;
    });

    // 綁定事件監聽器
    tbody.querySelectorAll('.detail-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            showAuthorDetail(index);
        });
    });

    section.style.display = 'block';
}

// 顯示作者詳細資訊
function showAuthorDetail(index) {
    const authorScore = window.authorScoresData[index];
    if (!authorScore) {
        console.error('找不到作者資料');
        return;
    }

    // 計算各細項得分說明
    const m = authorScore.metrics;

    // Commit 行為品質細項
    const filesPerCommitScore = getFilesPerCommitScore(m.avg_files_per_commit);
    const recentActivityScore = getRecentActivityScore(m.days_since_last_commit);
    const messageLengthScore = getMessageLengthScore(m.avg_message_length);

    // 工作品質與範圍細項
    const scopeBreadthScore = getScopeBreadthScore(m.files_modified);
    const codeChangeScaleScore = getCodeChangeScaleScore(m.total_code_changes);
    const qualityStabilityScore = getQualityStabilityScore(m.rapid_rework_ratio);

    // 活躍度細項
    const filesModifiedScore2 = getFilesModifiedScore(m.files_modified);
    const activeDaysScore = getActiveDaysScore(m.active_days);
    const contributionScore = getContributionScore(m.contribution_ratio);

    const modalHtml = `
        <div class="author-detail-modal active" onclick="closeAuthorDetail(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>${escapeHtml(authorScore.author)} - 品質評分詳情</h3>
                    <button class="modal-close" onclick="closeAuthorDetail()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="metric-item">
                        <span class="metric-label">總分</span>
                        <span class="metric-value"><strong>${authorScore.total_score}</strong> / 100</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">等級</span>
                        <span class="metric-value"><span class="grade-badge grade-${authorScore.grade}">${authorScore.grade}</span></span>
                    </div>

                    <div class="score-breakdown">
                        <h4>📊 評分明細與算法說明</h4>

                        <div style="margin-bottom: 25px;">
                            <div class="metric-item" style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 5px;">
                                <span class="metric-label"><strong>1. Commit 行為品質</strong></span>
                                <span class="metric-value"><strong>${authorScore.scores.commit_behavior}</strong> / 40</span>
                            </div>

                            <div style="padding-left: 15px; margin-top: 10px;">
                                <div class="metric-item" style="margin-bottom: 8px;">
                                    <span class="metric-label">• 平均每 commit 修改檔案數 (20分)</span>
                                    <span class="metric-value">${filesPerCommitScore.score}分</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-left: 20px; margin-bottom: 10px;">
                                    當前值：${m.avg_files_per_commit} 個檔案<br>
                                    評分標準：${filesPerCommitScore.desc}
                                </div>

                                <div class="metric-item" style="margin-bottom: 8px;">
                                    <span class="metric-label">• 最近活躍度 (5分)</span>
                                    <span class="metric-value">${recentActivityScore.score}分</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-left: 20px; margin-bottom: 10px;">
                                    當前值：距離最近 commit ${m.days_since_last_commit} 天<br>
                                    評分標準：${recentActivityScore.desc}
                                </div>

                                <div class="metric-item" style="margin-bottom: 8px;">
                                    <span class="metric-label">• Commit message 品質 (15分)</span>
                                    <span class="metric-value">${messageLengthScore.score}分</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-left: 20px; margin-bottom: 10px;">
                                    當前值：${m.avg_message_length} 字元<br>
                                    評分標準：${messageLengthScore.desc}
                                </div>
                            </div>
                        </div>

                        <div style="margin-bottom: 25px;">
                            <div class="metric-item" style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 5px;">
                                <span class="metric-label"><strong>2. 工作品質與範圍</strong></span>
                                <span class="metric-value"><strong>${authorScore.scores.quality_and_scope}</strong> / 30</span>
                            </div>

                            <div style="padding-left: 15px; margin-top: 10px;">
                                <div class="metric-item" style="margin-bottom: 8px;">
                                    <span class="metric-label">• 修改範圍廣度 (8分)</span>
                                    <span class="metric-value">${scopeBreadthScore.score}分</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-left: 20px; margin-bottom: 10px;">
                                    當前值：修改 ${m.files_modified} 個不同檔案<br>
                                    評分標準：${scopeBreadthScore.desc}
                                </div>

                                <div class="metric-item" style="margin-bottom: 8px;">
                                    <span class="metric-label">• 程式碼變動規模 (7分)</span>
                                    <span class="metric-value">${codeChangeScaleScore.score}分</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-left: 20px; margin-bottom: 10px;">
                                    當前值：總變動 ${m.total_code_changes} 行<br>
                                    評分標準：${codeChangeScaleScore.desc}
                                </div>

                                <div class="metric-item" style="margin-bottom: 8px;">
                                    <span class="metric-label">• 修改品質穩定性 (15分) ⭐核心指標</span>
                                    <span class="metric-value">${qualityStabilityScore.score}分</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-left: 20px; margin-bottom: 10px;">
                                    當前值：${m.rapid_rework_ratio}% 快速返工比例（5天內反覆修改同一檔案）<br>
                                    評分標準：${qualityStabilityScore.desc}
                                </div>
                            </div>
                        </div>

                        <div style="margin-bottom: 25px;">
                            <div class="metric-item" style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 5px;">
                                <span class="metric-label"><strong>3. 活躍度與影響力</strong></span>
                                <span class="metric-value"><strong>${authorScore.scores.activity}</strong> / 30</span>
                            </div>

                            <div style="padding-left: 15px; margin-top: 10px;">
                                <div class="metric-item" style="margin-bottom: 8px;">
                                    <span class="metric-label">• 修改檔案總數 (10分)</span>
                                    <span class="metric-value">${filesModifiedScore2.score}分</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-left: 20px; margin-bottom: 10px;">
                                    當前值：${m.files_modified} 個檔案<br>
                                    評分標準：${filesModifiedScore2.desc}
                                </div>

                                <div class="metric-item" style="margin-bottom: 8px;">
                                    <span class="metric-label">• 活躍時間跨度 (10分)</span>
                                    <span class="metric-value">${activeDaysScore.score}分</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-left: 20px; margin-bottom: 10px;">
                                    當前值：${m.active_days} 天<br>
                                    評分標準：${activeDaysScore.desc}
                                </div>

                                <div class="metric-item" style="margin-bottom: 8px;">
                                    <span class="metric-label">• 專案貢獻比例 (10分)</span>
                                    <span class="metric-value">${contributionScore.score}分</span>
                                </div>
                                <div style="font-size: 0.85em; color: #666; margin-left: 20px; margin-bottom: 10px;">
                                    當前值：${m.contribution_ratio}%<br>
                                    評分標準：${contributionScore.desc}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="score-breakdown">
                        <h4>📈 原始指標摘要</h4>
                        <div class="metric-item">
                            <span class="metric-label">總 Commits</span>
                            <span class="metric-value">${m.total_commits}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">修改檔案數</span>
                            <span class="metric-value">${m.files_modified}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">活躍天數</span>
                            <span class="metric-value">${m.active_days} 天</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 插入 modal 到 body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// 各項評分算法的輔助函數
function getFilesPerCommitScore(avg) {
    let score = 5;
    let matchedLevel = '';

    if (avg >= 1 && avg <= 3) {
        score = 20;
        matchedLevel = '1-3個';
    } else if (avg > 3 && avg <= 6) {
        score = 18;
        matchedLevel = '3-6個';
    } else if ((avg >= 0.5 && avg < 1) || (avg > 6 && avg <= 10)) {
        score = 15;
        matchedLevel = '0.5-1或6-10個';
    } else if (avg > 10 && avg <= 15) {
        score = 10;
        matchedLevel = '10-15個';
    } else {
        matchedLevel = '其他';
    }

    const allLevels = [
        { range: '1-3個', points: 20, label: '最佳（一般維護或小功能）', matched: matchedLevel === '1-3個' },
        { range: '3-6個', points: 18, label: '優秀（新增功能含多個檔案）', matched: matchedLevel === '3-6個' },
        { range: '0.5-1或6-10個', points: 15, label: '良好', matched: matchedLevel === '0.5-1或6-10個' },
        { range: '10-15個', points: 10, label: '普通（較大功能或重構）', matched: matchedLevel === '10-15個' },
        { range: '其他', points: 5, label: '需改善（過於碎片或散彈式）', matched: matchedLevel === '其他' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

function getRecentActivityScore(daysSince) {
    let score = 1;
    let matchedLevel = '';

    if (daysSince <= 30) {
        score = 5;
        matchedLevel = '≤30天';
    } else if (daysSince <= 90) {
        score = 3;
        matchedLevel = '≤90天';
    } else {
        matchedLevel = '>90天';
    }

    const allLevels = [
        { range: '≤30天', points: 5, label: '最近活躍（30天內有 commit）', matched: matchedLevel === '≤30天' },
        { range: '≤90天', points: 3, label: '間歇活躍（90天內有 commit）', matched: matchedLevel === '≤90天' },
        { range: '>90天', points: 1, label: '長期沒活動（超過90天）', matched: matchedLevel === '>90天' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

function getMessageLengthScore(length) {
    let score = 5;
    let matchedLevel = '';

    if (length >= 20) {
        score = 15;
        matchedLevel = '≥20字元';
    } else if (length >= 10) {
        score = 11;
        matchedLevel = '10-20字元';
    } else {
        matchedLevel = '<10字元';
    }

    const allLevels = [
        { range: '≥20字元', points: 15, label: '最佳', matched: matchedLevel === '≥20字元' },
        { range: '10-20字元', points: 11, label: '良好', matched: matchedLevel === '10-20字元' },
        { range: '<10字元', points: 5, label: '需改善', matched: matchedLevel === '<10字元' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

function getConcentrationScore(concentration) {
    let score = 6;
    let matchedLevel = '';

    if (concentration >= 40 && concentration <= 70) {
        score = 20;
        matchedLevel = '40-70%';
    } else if ((concentration >= 30 && concentration < 40) || (concentration > 70 && concentration <= 80)) {
        score = 16;
        matchedLevel = '30-40或70-80%';
    } else if ((concentration >= 20 && concentration < 30) || (concentration > 80 && concentration <= 90)) {
        score = 12;
        matchedLevel = '20-30或80-90%';
    } else {
        matchedLevel = '其他';
    }

    const allLevels = [
        { range: '40-70%', points: 20, label: '最佳（專注但不過度集中）', matched: matchedLevel === '40-70%' },
        { range: '30-40或70-80%', points: 16, label: '良好', matched: matchedLevel === '30-40或70-80%' },
        { range: '20-30或80-90%', points: 12, label: '普通', matched: matchedLevel === '20-30或80-90%' },
        { range: '其他', points: 6, label: '需改善', matched: matchedLevel === '其他' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

function getHotspotScore(participation) {
    let score = 2;
    let matchedLevel = '';

    if (participation >= 30 && participation <= 50) {
        score = 10;
        matchedLevel = '30-50%';
    } else if ((participation >= 20 && participation < 30) || (participation > 50 && participation <= 60)) {
        score = 8;
        matchedLevel = '20-30或50-60%';
    } else if ((participation >= 10 && participation < 20) || (participation > 60 && participation <= 70)) {
        score = 5;
        matchedLevel = '10-20或60-70%';
    } else {
        matchedLevel = '其他';
    }

    const allLevels = [
        { range: '30-50%', points: 10, label: '最佳（參與核心開發）', matched: matchedLevel === '30-50%' },
        { range: '20-30或50-60%', points: 8, label: '良好', matched: matchedLevel === '20-30或50-60%' },
        { range: '10-20或60-70%', points: 5, label: '普通', matched: matchedLevel === '10-20或60-70%' },
        { range: '其他', points: 2, label: '較少參與核心', matched: matchedLevel === '其他' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

function getFilesModifiedScore(files) {
    let score = 3;
    let matchedLevel = '';

    if (files >= 50) {
        score = 10;
        matchedLevel = '≥50個';
    } else if (files >= 30) {
        score = 8;
        matchedLevel = '≥30個';
    } else if (files >= 10) {
        score = 6;
        matchedLevel = '≥10個';
    } else {
        matchedLevel = '<10個';
    }

    const allLevels = [
        { range: '≥50個', points: 10, label: '廣泛影響', matched: matchedLevel === '≥50個' },
        { range: '≥30個', points: 8, label: '良好', matched: matchedLevel === '≥30個' },
        { range: '≥10個', points: 6, label: '普通', matched: matchedLevel === '≥10個' },
        { range: '<10個', points: 3, label: '較少', matched: matchedLevel === '<10個' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

function getActiveDaysScore(days) {
    let score = 3;
    let matchedLevel = '';

    if (days >= 180) {
        score = 10;
        matchedLevel = '≥180天';
    } else if (days >= 90) {
        score = 8;
        matchedLevel = '≥90天';
    } else if (days >= 30) {
        score = 6;
        matchedLevel = '≥30天';
    } else {
        matchedLevel = '<30天';
    }

    const allLevels = [
        { range: '≥180天', points: 10, label: '半年以上', matched: matchedLevel === '≥180天' },
        { range: '≥90天', points: 8, label: '三個月以上', matched: matchedLevel === '≥90天' },
        { range: '≥30天', points: 6, label: '一個月以上', matched: matchedLevel === '≥30天' },
        { range: '<30天', points: 3, label: '未滿一個月', matched: matchedLevel === '<30天' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

function getContributionScore(ratio) {
    let score = 3;
    let matchedLevel = '';

    if (ratio >= 30) {
        score = 10;
        matchedLevel = '≥30%';
    } else if (ratio >= 15) {
        score = 8;
        matchedLevel = '≥15%';
    } else if (ratio >= 5) {
        score = 6;
        matchedLevel = '≥5%';
    } else {
        matchedLevel = '<5%';
    }

    const allLevels = [
        { range: '≥30%', points: 10, label: '核心貢獻者', matched: matchedLevel === '≥30%' },
        { range: '≥15%', points: 8, label: '主要貢獻者', matched: matchedLevel === '≥15%' },
        { range: '≥5%', points: 6, label: '一般貢獻者', matched: matchedLevel === '≥5%' },
        { range: '<5%', points: 3, label: '偶爾貢獻', matched: matchedLevel === '<5%' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

// 新增：修改範圍廣度評分函數
function getScopeBreadthScore(filesModified) {
    let score = 1;
    let matchedLevel = '';

    if (filesModified >= 50) {
        score = 8;
        matchedLevel = '≥50個';
    } else if (filesModified >= 30) {
        score = 7;
        matchedLevel = '≥30個';
    } else if (filesModified >= 15) {
        score = 5;
        matchedLevel = '≥15個';
    } else if (filesModified >= 5) {
        score = 3;
        matchedLevel = '≥5個';
    } else {
        matchedLevel = '<5個';
    }

    const allLevels = [
        { range: '≥50個', points: 8, label: '廣泛', matched: matchedLevel === '≥50個' },
        { range: '≥30個', points: 7, label: '良好', matched: matchedLevel === '≥30個' },
        { range: '≥15個', points: 5, label: '普通', matched: matchedLevel === '≥15個' },
        { range: '≥5個', points: 3, label: '範圍較窄', matched: matchedLevel === '≥5個' },
        { range: '<5個', points: 1, label: '專注於少數檔案', matched: matchedLevel === '<5個' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

// 新增：程式碼變動規模評分函數
function getCodeChangeScaleScore(totalChanges) {
    let score = 1;
    let matchedLevel = '';

    if (totalChanges >= 10000) {
        score = 7;
        matchedLevel = '≥10000行';
    } else if (totalChanges >= 5000) {
        score = 6;
        matchedLevel = '≥5000行';
    } else if (totalChanges >= 2000) {
        score = 4;
        matchedLevel = '≥2000行';
    } else if (totalChanges >= 500) {
        score = 2;
        matchedLevel = '≥500行';
    } else {
        matchedLevel = '<500行';
    }

    const allLevels = [
        { range: '≥10000行', points: 7, label: '大規模變動', matched: matchedLevel === '≥10000行' },
        { range: '≥5000行', points: 6, label: '中等規模', matched: matchedLevel === '≥5000行' },
        { range: '≥2000行', points: 4, label: '一般規模', matched: matchedLevel === '≥2000行' },
        { range: '≥500行', points: 2, label: '小規模', matched: matchedLevel === '≥500行' },
        { range: '<500行', points: 1, label: '微小變動', matched: matchedLevel === '<500行' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

// 新增：修改品質穩定性評分函數（核心指標）
function getQualityStabilityScore(rapidReworkRatio) {
    let score = 2;
    let matchedLevel = '';

    if (rapidReworkRatio <= 10) {
        score = 15;
        matchedLevel = '≤10%';
    } else if (rapidReworkRatio <= 20) {
        score = 12;
        matchedLevel = '≤20%';
    } else if (rapidReworkRatio <= 30) {
        score = 9;
        matchedLevel = '≤30%';
    } else if (rapidReworkRatio <= 50) {
        score = 5;
        matchedLevel = '≤50%';
    } else {
        matchedLevel = '>50%';
    }

    const allLevels = [
        { range: '≤10%', points: 15, label: '優秀品質（快速返工比例低）', matched: matchedLevel === '≤10%' },
        { range: '≤20%', points: 12, label: '良好品質', matched: matchedLevel === '≤20%' },
        { range: '≤30%', points: 9, label: '普通品質', matched: matchedLevel === '≤30%' },
        { range: '≤50%', points: 5, label: '需改善', matched: matchedLevel === '≤50%' },
        { range: '>50%', points: 2, label: '品質問題嚴重（頻繁返工）', matched: matchedLevel === '>50%' }
    ];

    const desc = allLevels.map(level =>
        `${level.matched ? '<strong style="color: #667eea;">✓ ' : ''}${level.range}：${level.label}(${level.points}分)${level.matched ? '</strong>' : ''}`
    ).join('<br>');

    return { score, desc };
}

// 關閉作者詳細資訊
function closeAuthorDetail(event) {
    const modal = document.querySelector('.author-detail-modal');
    if (modal) {
        modal.remove();
    }
}
