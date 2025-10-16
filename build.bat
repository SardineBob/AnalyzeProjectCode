cd C:\Bob\32.SideProject\AnalyzeProjectCode
CALL conda activate codeanalyzer
CALL pyinstaller main.py --add-data "static;static" --onefile --name "CodeAnalyzer"
ECHO Build completed!
PAUSE