# 程式碼分析工具

一套專為開發團隊打造的程式碼分析工具，能夠針對指定的專案資料夾進行靜態分析，並整合 Git 版本控制資訊，幫助了解專案規模、複雜度與維護熱點。

## 功能特色

### 1. 程式碼分析
- 分析程式碼行數 (Lines of Code)
- 統計檔案數量
- 計算程式碼複雜度 (Cyclomatic Complexity)
- 識別最複雜的檔案和函數

### 2. Git Log 分析
- 讀取專案 Git 歷史記錄
- 統計各檔案異動次數
- 找出異動最頻繁的檔案
- 顯示最近的 commits

### 3. 視覺化儀表板
- 直觀的圖表呈現分析結果
- 長條圖顯示複雜度分佈
- 圓餅圖顯示檔案異動頻率
- 表格詳細列出檔案資訊

## 技術架構

- **程式語言**：Python 3.8+
- **後端框架**：FastAPI
- **程式碼分析**：Lizard
- **Git 分析**：GitPython
- **前端**：HTML5 + CSS3 + JavaScript + Chart.js

## 安裝步驟

### 1. 確認環境需求
確保已安裝 Python 3.8 或更高版本：
```bash
python --version
```

### 2. 安裝相依套件
```bash
pip install -r requirements.txt
```

## 使用方式

### 1. 啟動服務
```bash
python main.py
```

或使用 uvicorn：
```bash
uvicorn main:app --reload
```

### 2. 開啟瀏覽器
在瀏覽器中開啟：
```
http://localhost:8000
```

### 3. 分析專案
1. 在輸入框中輸入專案資料夾的完整路徑
   - Windows 範例：`C:\Projects\MyProject`
   - Linux/Mac 範例：`/home/user/projects/myproject`
2. 點擊「開始分析」按鈕
3. 等待分析完成，查看結果

## API 端點

### 分析程式碼
```http
POST /api/analyze/code
Content-Type: application/json

{
  "project_path": "/path/to/project"
}
```

### 分析 Git 歷史
```http
POST /api/analyze/git
Content-Type: application/json

{
  "project_path": "/path/to/project"
}
```

### 完整分析
```http
POST /api/analyze/all
Content-Type: application/json

{
  "project_path": "/path/to/project"
}
```

### 健康檢查
```http
GET /api/health
```

## 分析指標說明

### 程式碼複雜度 (Cyclomatic Complexity)
- **1-5**：低複雜度，程式碼簡單易懂
- **6-10**：中等複雜度，需要適度關注
- **11-20**：高複雜度，建議重構
- **>20**：極高複雜度，強烈建議重構

### 檔案異動頻率
- **低頻 (1-5次)**：較少修改的穩定檔案
- **中頻 (6-15次)**：正常維護的檔案
- **高頻 (16-30次)**：頻繁修改的檔案
- **極高頻 (>30次)**：維護熱點，可能需要重構

## 效能特性

- 針對 10 萬行程式碼，可在 1 分鐘內產出分析結果
- 自動排除常見的無關資料夾（node_modules, venv, .git 等）
- 支援多種程式語言的分析

## 專案結構

```
AnalyzeProjectCode/
├── main.py                 # FastAPI 主程式
├── code_analyzer.py        # 程式碼分析模組
├── git_analyzer.py         # Git 分析模組
├── requirements.txt        # Python 相依套件
├── README.md              # 使用說明
├── RFP.txt                # 需求規格書
├── static/                # 前端靜態檔案
│   ├── index.html         # 主頁面
│   ├── style.css          # 樣式表
│   └── script.js          # JavaScript 邏輯
└── .gitignore             # Git 忽略檔案
```

## 注意事項

1. **Git 分析限制**：只有 Git 倉庫才能進行 Git 歷史分析，非 Git 專案只會顯示程式碼分析結果
2. **路徑格式**：Windows 使用者請使用完整路徑（如 `C:\Projects\MyProject`）
3. **權限問題**：確保程式有讀取目標專案資料夾的權限
4. **分析時間**：大型專案可能需要較長的分析時間，請耐心等候

## 未來擴充方向

- [ ] 支援更多程式碼品質指標
- [ ] 匯出分析報告（PDF/Excel）
- [ ] 歷史趨勢分析
- [ ] 團隊協作分析
- [ ] 程式碼重複度檢測
- [ ] 技術債務評估

## 授權

本專案僅供學習和內部使用。

## 問題回報

如遇到問題或有建議，請聯繫開發團隊。
