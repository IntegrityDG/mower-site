$ErrorActionPreference = "Stop"

$seedPath = Join-Path $PSScriptRoot "yarbo-everyday-pricing-2026.sql"
$expectedSha256 = "261a3220e0f80fd6dba1e21365784ab382bb26d022248bab07d68dd9efe14707"
$actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $seedPath).Hash.ToLowerInvariant()

if ($actualSha256 -ne $expectedSha256) {
  throw "Refusing permanent Yarbo pricing run: reviewed seed SHA-256 changed."
}

$rollbackSql = [System.IO.File]::ReadAllText($seedPath)
$firstExecutable = (
  $rollbackSql -split "\r?\n" |
    Where-Object { $_.Trim() -and -not $_.Trim().StartsWith("--") } |
    Select-Object -First 1
).Trim()
$lastExecutable = (
  $rollbackSql -split "\r?\n" |
    Where-Object { $_.Trim() -and -not $_.Trim().StartsWith("--") } |
    Select-Object -Last 1
).Trim()

if ($firstExecutable -ne "BEGIN;") {
  throw "Refusing permanent Yarbo pricing run: first executable statement is not BEGIN."
}

if ($lastExecutable -ne "ROLLBACK;") {
  throw "Refusing permanent Yarbo pricing run: reviewed seed does not end with ROLLBACK."
}

if ($rollbackSql -match "(?im)^\s*(CREATE|ALTER|DROP|TRUNCATE)\b") {
  throw "Refusing permanent Yarbo pricing run: reviewed seed contains DDL."
}

if ($rollbackSql -match "(?im)^\s*COMMIT\s*;") {
  throw "Refusing permanent Yarbo pricing run: reviewed seed already contains COMMIT."
}

$commitSql = [regex]::Replace(
  $rollbackSql,
  "ROLLBACK;\s*\z",
  "COMMIT;",
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

if ($commitSql -eq $rollbackSql) {
  throw "Refusing permanent Yarbo pricing run: terminal ROLLBACK replacement failed."
}

$temporarySqlPath = Join-Path (
  [System.IO.Path]::GetTempPath()
) "yarbo-everyday-pricing-2026-$([guid]::NewGuid().ToString('N')).sql"

try {
  [System.IO.File]::WriteAllText(
    $temporarySqlPath,
    $commitSql,
    [System.Text.UTF8Encoding]::new($false)
  )

  & npx.cmd --yes supabase@2.109.1 db query --linked --file $temporarySqlPath --output-format json

  if ($LASTEXITCODE -ne 0) {
    throw "Permanent Yarbo pricing command failed with exit code $LASTEXITCODE."
  }
}
finally {
  if (Test-Path -LiteralPath $temporarySqlPath) {
    Remove-Item -LiteralPath $temporarySqlPath -Force
  }
}
