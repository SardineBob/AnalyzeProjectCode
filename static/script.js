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

        const configData = {
            project_path: projectPathInput.value.trim(),
            exclude_folders: excludeFolders.length > 0 ? excludeFolders : null,
            exclude_code_files: excludeCodeFiles.length > 0 ? excludeCodeFiles : null,
            exclude_git_files: excludeGitFiles.length > 0 ? excludeGitFiles : null,
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
