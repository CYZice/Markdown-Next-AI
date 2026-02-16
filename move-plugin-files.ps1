param(
    [string]$SourceRoot = "d:\Microsoft VS Code\PYTHON\FlowText\test_ai\.obsidian\plugins\Markdown-Next-AI",
    [string]$TargetRoot = "D:\Obsidian\ABCDE\.obsidian\plugins\markdown-next-ai"
)

$files = @(
    "main.js",
    "manifest.json",
    "styles.css"
)

if (-not (Test-Path -Path $TargetRoot)) {
    New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
}

foreach ($file in $files) {
    $sourcePath = Join-Path $SourceRoot $file
    $targetPath = Join-Path $TargetRoot $file

    if (-not (Test-Path -Path $sourcePath)) {
        Write-Host "跳过不存在文件: $sourcePath"
        continue
    }

    Copy-Item -Path $sourcePath -Destination $targetPath -Force
    Write-Host "已复制: $sourcePath -> $targetPath"
}
