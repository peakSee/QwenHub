# qwen-gate Windows Installer
# Run: powershell -ExecutionPolicy Bypass -c "curl.exe -sSL https://raw.githubusercontent.com/youssefvdel/qwen-gate/main/install.ps1 | iex"

$ErrorActionPreference = "Stop"
$Repo = "https://github.com/youssefvdel/qwen-gate.git"
$Dir = "$PWD\qwen-gate"
$DefaultPort = 26405

# ── Helpers ──────────────────────────────────────────────────────────

function Info  { Write-Host "  -> " -ForegroundColor Cyan -NoNewline; Write-Host $args }
function Ok    { Write-Host "  OK " -ForegroundColor Green -NoNewline; Write-Host $args }
function Warn  { Write-Host "  !! " -ForegroundColor Yellow -NoNewline; Write-Host $args }
function Fail  { Write-Host "  ERROR " -ForegroundColor Red -NoNewline; Write-Host $args; exit 1 }

function Test-Command {
  param([string]$Name)
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# ── Banner ───────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host "         qwen-gate Windows Installer" -ForegroundColor Cyan
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Git (required) ───────────────────────────────────────────────

Info "Checking for git..."
if (-not (Test-Command "git")) {
  Fail "git is required but not found. Install from https://git-scm.com"
}
Ok "git $(git --version)"

# ── 2. Bun (preferred) / Node.js (fallback) ────────────────────────

$UseBun = $false
$UseNode = $false

Info "Checking for Bun..."
if (Test-Command "bun") {
  $UseBun = $true
  Ok "bun v$(bun --version)"
} else {
  Warn "Bun not found — attempting install..."
  try {
    irm bun.sh/install.ps1 | iex
    if (Test-Command "bun") {
      $UseBun = $true
      Ok "Bun installed (v$(bun --version))"
    }
  } catch {
    Warn "Auto-install failed. Trying npm -g bun..."
    try {
      npm install -g bun 2>$null
      if (Test-Command "bun") {
        $UseBun = $true
        Ok "Bun installed via npm (v$(bun --version))"
      }
    } catch { }
  }

  if (-not $UseBun) {
    Warn "Bun not available — falling back to Node.js"
    if (-not (Test-Command "node")) {
      Fail "Neither Bun nor Node.js found. Install Bun: https://bun.sh"
    }
    if (-not (Test-Command "npm")) {
      Fail "Node.js found but npm is missing. Reinstall Node.js from https://nodejs.org"
    }
    $NodeVer = (node -v) -replace 'v', '' -split '\.' | Select-Object -First 1
    if ([int]$NodeVer -lt 18) {
      Fail "Node.js >= 18 required (found v$(node -v))"
    }
    Ok "node v$(node -v), npm v$(npm -v) (fallback)"
    $UseNode = $true
  }
}

# ── 3. Clone or update ──────────────────────────────────────────────

if (Test-Path "$Dir") {
  Info "Existing installation found — updating..."
  git -C "$Dir" pull --ff-only 2>$null
  if ($LASTEXITCODE -ne 0) {
    Warn "git pull failed — using existing code"
  } else {
    Ok "Repository updated"
  }
} else {
  Info "Cloning $Repo..."
  git clone "$Repo" "$Dir" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Fail "git clone failed — check your internet connection"
  }
  Ok "Repository cloned"
}

# ── 4. Install dependencies ─────────────────────────────────────────

Info "Installing dependencies..."
Set-Location "$Dir"

if ($UseBun) {
  bun install --frozen-lockfile 2>$null
  if ($LASTEXITCODE -ne 0) { bun install }
  if ($LASTEXITCODE -ne 0) { Fail "bun install failed" }
  Ok "Dependencies installed via bun"
} else {
  npm install 2>$null
  if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }
  Ok "Dependencies installed via npm"
}

# ── 4b. Install Playwright browsers ────────────────────────────────

Info "Installing Playwright browsers..."
try {
  npx playwright install 2>$null
  if ($LASTEXITCODE -ne 0) {
    Warn "Playwright browser install returned non-zero exit code — continuing anyway"
  } else {
    Ok "Playwright browsers installed"
  }
} catch {
  Warn "Playwright browser install failed — continuing anyway ($_ )"
}

# ── 5. Configuration ────────────────────────────────────────────────

if (-not (Test-Path "$Dir\config.json")) {
  Info "config.json will be auto-generated on first start"
} else {
  Ok "config.json already exists (skipped)"
}

# ── 6. Add bin/ to user PATH ────────────────────────────────────────

$BinDir = "$Dir\bin"
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($UserPath -notlike "*$BinDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$UserPath;$BinDir", "User")
  $env:Path = "$env:Path;$BinDir"
  Ok "Added $BinDir to user PATH"
} else {
  Ok "bin/ already in PATH"
}

# ── 7. Success banner ───────────────────────────────────────────────

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Green
Write-Host "     qwen-gate installed successfully!" -ForegroundColor Green
Write-Host "  ========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Runtime:   $(if ($UseBun) { 'Bun' } else { 'Node.js' })" -ForegroundColor White
Write-Host "  Directory: $Dir" -ForegroundColor White
Write-Host "  Port:      $DefaultPort" -ForegroundColor White
Write-Host ""
Write-Host "  Commands:" -ForegroundColor Yellow
Write-Host "    qg              Start the server"
Write-Host "    qg update       Update to latest"
Write-Host "    qg restart      Restart server"
Write-Host "    qg status       Check if running"
Write-Host ""
Write-Host "  Dashboard: http://localhost:$DefaultPort/dashboard" -ForegroundColor Cyan
Write-Host "  API:       http://localhost:$DefaultPort/v1" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Restart your terminal, then run 'qg' to start." -ForegroundColor Gray
Write-Host ""
