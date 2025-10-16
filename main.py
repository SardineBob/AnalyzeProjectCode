"""
FastAPI 主程式
提供程式碼分析與 Git 分析的 API 服務
"""
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import os
import sys
import json
import asyncio
from pathlib import Path
from queue import Queue
import threading
from concurrent.futures import ThreadPoolExecutor

from code_analyzer import CodeAnalyzer
from git_analyzer import GitAnalyzer
from progress_tracker import ProgressTracker, ProgressUpdate
from config_manager import ConfigManager


def get_resource_path(relative_path: str) -> Path:
    """
    取得資源檔案的絕對路徑（支援 PyInstaller 打包）

    Args:
        relative_path: 相對路徑

    Returns:
        資源檔案的絕對路徑
    """
    try:
        # PyInstaller 打包後的臨時資料夾
        base_path = Path(sys._MEIPASS)
    except AttributeError:
        # 開發環境
        base_path = Path(__file__).parent

    return base_path / relative_path

app = FastAPI(
    title="程式碼分析工具",
    description="分析專案程式碼規模、複雜度與 Git 版本控制資訊",
    version="2.2.0"
)

# 全域進度佇列和執行緒池
progress_queues: Dict[str, Queue] = {}
executor = ThreadPoolExecutor(max_workers=4)

# 設定管理器實例
config_manager = ConfigManager()


class AnalyzeRequest(BaseModel):
    """分析請求模型"""
    project_path: str
    session_id: Optional[str] = None  # 會話 ID（用於進度追蹤）
    exclude_folders: Optional[List[str]] = None  # 排除的資料夾列表（程式碼分析）
    exclude_code_files: Optional[List[str]] = None  # 排除的檔案列表（程式碼分析）
    exclude_git_files: Optional[List[str]] = None  # 排除的檔案列表（Git 分析）
    filter_authors: Optional[List[str]] = None  # 指定的作者列表（Git 分析，空則顯示全部）
    start_commit: Optional[str] = None  # Git 起始 commit ID
    end_commit: Optional[str] = None  # Git 結束 commit ID
    max_commits: Optional[int] = 1000  # Git 最大分析 commit 數量


@app.get("/")
async def root():
    """首頁"""
    index_path = get_resource_path("static/index.html")
    return FileResponse(str(index_path))


@app.get("/api/progress/{session_id}")
async def progress_stream(session_id: str):
    """
    SSE 進度串流端點

    Args:
        session_id: 分析會話 ID

    Returns:
        Server-Sent Events 串流
    """
    async def event_generator():
        # 建立進度佇列
        if session_id not in progress_queues:
            progress_queues[session_id] = Queue()

        queue = progress_queues[session_id]

        try:
            while True:
                # 檢查佇列中是否有新的進度更新
                if not queue.empty():
                    progress: ProgressUpdate = queue.get()

                    # 轉換為 SSE 格式
                    data = {
                        "stage": progress.stage,
                        "current": progress.current,
                        "total": progress.total,
                        "message": progress.message,
                        "percentage": int((progress.current / progress.total * 100) if progress.total > 0 else 0),
                        "timestamp": progress.timestamp
                    }

                    yield f"data: {json.dumps(data)}\n\n"

                    # 如果是完成訊息，結束串流
                    if progress.stage == "completed" or progress.stage == "error":
                        break

                await asyncio.sleep(0.1)  # 避免 CPU 過度使用
        finally:
            # 清理佇列
            if session_id in progress_queues:
                del progress_queues[session_id]

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.post("/api/analyze/code")
async def analyze_code(request: AnalyzeRequest) -> Dict[str, Any]:
    """
    分析程式碼

    Args:
        request: 包含專案路徑和排除資料夾的請求

    Returns:
        程式碼分析結果
    """
    try:
        analyzer = CodeAnalyzer(
            request.project_path,
            exclude_folders=request.exclude_folders,
            exclude_files=request.exclude_code_files
        )
        result = analyzer.analyze()
        return {
            "status": "success",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失敗: {str(e)}")


@app.post("/api/analyze/git")
async def analyze_git(request: AnalyzeRequest) -> Dict[str, Any]:
    """
    分析 Git 歷史

    Args:
        request: 包含專案路徑、排除檔案和 commit 範圍的請求

    Returns:
        Git 分析結果
    """
    try:
        analyzer = GitAnalyzer(
            request.project_path,
            exclude_files=request.exclude_git_files,
            filter_authors=request.filter_authors,
            start_commit=request.start_commit,
            end_commit=request.end_commit
        )
        result = analyzer.analyze()
        return {
            "status": "success",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失敗: {str(e)}")


def run_analysis_sync(request: AnalyzeRequest, session_id: str) -> Dict[str, Any]:
    """
    同步執行分析（在背景執行緒中執行）
    """
    # 建立進度追蹤器
    def progress_callback(progress: ProgressUpdate):
        if session_id and session_id in progress_queues:
            progress_queues[session_id].put(progress)

    tracker = ProgressTracker(callback=progress_callback)

    try:
        # 初始化進度
        tracker.update("init", 0, 100, "開始分析...")

        # 程式碼分析
        tracker.update("code_analysis", 10, 100, "正在分析程式碼...")
        code_analyzer = CodeAnalyzer(
            request.project_path,
            exclude_folders=request.exclude_folders,
            exclude_files=request.exclude_code_files,
            progress_tracker=tracker
        )
        code_result = code_analyzer.analyze()
        tracker.update("code_analysis", 50, 100, "程式碼分析完成")

        # Git 分析（如果是 Git 倉庫）
        git_result = None
        try:
            tracker.update("git_analysis", 55, 100, "正在分析 Git 歷史...")
            git_analyzer = GitAnalyzer(
                request.project_path,
                exclude_files=request.exclude_git_files,
                filter_authors=request.filter_authors,
                start_commit=request.start_commit,
                end_commit=request.end_commit,
                progress_tracker=tracker
            )
            git_result = git_analyzer.analyze(max_commits=request.max_commits or 1000)
            tracker.update("git_analysis", 95, 100, "Git 分析完成")
        except ValueError:
            # 不是 Git 倉庫，跳過 Git 分析
            tracker.update("git_analysis", 95, 100, "專案不是 Git 倉庫，跳過 Git 分析")

        tracker.update("completed", 100, 100, "分析完成！")

        return {
            "code": code_result,
            "git": git_result
        }
    except Exception as e:
        tracker.update("error", 0, 100, f"分析失敗：{str(e)}")
        raise


@app.post("/api/analyze/all")
async def analyze_all(request: AnalyzeRequest) -> Dict[str, Any]:
    """
    執行完整分析（程式碼 + Git）

    Args:
        request: 包含專案路徑和所有配置的請求

    Returns:
        完整分析結果
    """
    session_id = request.session_id

    try:
        # 初始化進度佇列
        if session_id:
            if session_id not in progress_queues:
                progress_queues[session_id] = Queue()

        # 在執行緒池中執行分析
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor,
            run_analysis_sync,
            request,
            session_id
        )

        return {
            "status": "success",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失敗: {str(e)}")


@app.get("/api/health")
async def health_check():
    """健康檢查"""
    return {"status": "ok"}


@app.get("/api/config")
async def get_config():
    """
    取得上次儲存的設定

    Returns:
        設定資料
    """
    try:
        config = config_manager.get_last_config()
        return {
            "status": "success",
            "data": config
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"讀取設定失敗: {str(e)}")


class SaveConfigRequest(BaseModel):
    """儲存設定請求模型"""
    project_path: str
    exclude_folders: Optional[List[str]] = None
    exclude_code_files: Optional[List[str]] = None
    exclude_git_files: Optional[List[str]] = None
    filter_authors: Optional[List[str]] = None
    start_commit: Optional[str] = None
    end_commit: Optional[str] = None
    max_commits: Optional[int] = 1000


@app.post("/api/config")
async def save_config(request: SaveConfigRequest):
    """
    儲存使用者設定

    Args:
        request: 設定資料

    Returns:
        儲存結果
    """
    try:
        config_data = {
            'project_path': request.project_path,
            'exclude_folders': request.exclude_folders or [],
            'exclude_code_files': request.exclude_code_files or [],
            'exclude_git_files': request.exclude_git_files or [],
            'filter_authors': request.filter_authors or [],
            'start_commit': request.start_commit or '',
            'end_commit': request.end_commit or '',
            'max_commits': request.max_commits or 1000
        }

        success = config_manager.save_config(config_data)
        if success:
            return {
                "status": "success",
                "message": "設定已儲存"
            }
        else:
            raise HTTPException(status_code=500, detail="儲存設定失敗")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"儲存設定失敗: {str(e)}")


@app.delete("/api/config")
async def clear_config():
    """
    清除儲存的設定

    Returns:
        清除結果
    """
    try:
        success = config_manager.clear_config()
        if success:
            return {
                "status": "success",
                "message": "設定已清除"
            }
        else:
            raise HTTPException(status_code=500, detail="清除設定失敗")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清除設定失敗: {str(e)}")


# 掛載靜態檔案
static_path = get_resource_path("static")
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
