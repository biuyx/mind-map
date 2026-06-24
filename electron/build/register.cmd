@echo off
REM Post-install launcher: pops a dialog with the mind-map MCP config,
REM copies it to the clipboard, and can write it into Claude Desktop's config.
"%~dp0MindMap MCP.exe" --register
