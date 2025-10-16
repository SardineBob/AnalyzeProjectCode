cd C:\Bob\32.SideProject\AnalyzeProjectCode
CALL conda activate codeanalyzer
CALL pyinstaller --onefile main.py
robocopy "static" "dist\static" /E /R:3 /W:5
robocopy "." "dist" "user_config.json" /R:3 /W:5