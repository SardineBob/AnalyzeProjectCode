"""
FastAPI 主程式
提供程式碼分析與 Git 分析的 API 服務
"""
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import os
from pathlib import Path

from code_analyzer import CodeAnalyzer
from git_analyzer import GitAnalyzer

app = FastAPI(
    title="程式碼分析工具",
    description="分析專案程式碼規模、複雜度與 Git 版本控制資訊",
    version="2.0.0"
)


class AnalyzeRequest(BaseModel):
    """分析請求模型"""
    project_path: str
    exclude_folders: Optional[List[str]] = None  # 排除的資料夾列表（程式碼分析）
    exclude_code_files: Optional[List[str]] = None  # 排除的檔案列表（程式碼分析）
    exclude_git_files: Optional[List[str]] = None  # 排除的檔案列表（Git 分析）
    start_commit: Optional[str] = None  # Git 起始 commit ID
    end_commit: Optional[str] = None  # Git 結束 commit ID


@app.get("/")
async def root():
    """首頁"""
    return FileResponse("static/index.html")


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


@app.post("/api/analyze/all")
async def analyze_all(request: AnalyzeRequest) -> Dict[str, Any]:
    """
    執行完整分析（程式碼 + Git）

    Args:
        request: 包含專案路徑和所有配置的請求

    Returns:
        完整分析結果
    """
    try:
        # 程式碼分析
        code_analyzer = CodeAnalyzer(
            request.project_path,
            exclude_folders=request.exclude_folders,
            exclude_files=request.exclude_code_files
        )
        code_result = code_analyzer.analyze()

        # Git 分析（如果是 Git 倉庫）
        git_result = None
        try:
            git_analyzer = GitAnalyzer(
                request.project_path,
                exclude_files=request.exclude_git_files,
                start_commit=request.start_commit,
                end_commit=request.end_commit
            )
            git_result = git_analyzer.analyze()
        except ValueError:
            # 不是 Git 倉庫，跳過 Git 分析
            pass

        return {
            "status": "success",
            "data": {
                "code": code_result,
                "git": git_result
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失敗: {str(e)}")


@app.get("/api/health")
async def health_check():
    """健康檢查"""
    return {"status": "ok"}


# 掛載靜態檔案
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory="static"), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
