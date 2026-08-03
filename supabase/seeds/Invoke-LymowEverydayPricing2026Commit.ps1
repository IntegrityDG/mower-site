$ErrorActionPreference = "Stop"

$seedPath = Join-Path $PSScriptRoot "lymow-everyday-pricing-2026.sql"
$expectedSha256 = "c065195b463baadacabd7e1e7664a3a2b6e0362f90e75996bb54657a8b65dc68"
$actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $seedPath).Hash.ToLowerInvariant()

if ($actualSha256 -ne $expectedSha256) {
  throw "Refusing permanent Lymow pricing run: reviewed seed SHA-256 changed."
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
  throw "Refusing permanent Lymow pricing run: first executable statement is not BEGIN."
}

if ($lastExecutable -ne "ROLLBACK;") {
  throw "Refusing permanent Lymow pricing run: reviewed seed does not end with ROLLBACK."
}

if ($rollbackSql -match "(?im)^\s*(CREATE|ALTER|DROP|TRUNCATE)\b") {
  throw "Refusing permanent Lymow pricing run: reviewed seed contains DDL."
}

if ($rollbackSql -match "(?im)^\s*COMMIT\s*;") {
  throw "Refusing permanent Lymow pricing run: reviewed seed already contains COMMIT."
}

$commitSql = [regex]::Replace(
  $rollbackSql,
  "ROLLBACK;\s*\z",
  "COMMIT;",
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

if ($commitSql -eq $rollbackSql) {
  throw "Refusing permanent Lymow pricing run: terminal ROLLBACK replacement failed."
}

$temporarySqlPath = Join-Path (
  [System.IO.Path]::GetTempPath()
) "lymow-everyday-pricing-2026-$([guid]::NewGuid().ToString('N')).sql"

try {
  [System.IO.File]::WriteAllText(
    $temporarySqlPath,
    $commitSql,
    [System.Text.UTF8Encoding]::new($false)
  )

  & npx.cmd --yes supabase@2.109.1 db query --linked --file $temporarySqlPath --output-format json

  if ($LASTEXITCODE -ne 0) {
    throw "Permanent Lymow pricing command failed with exit code $LASTEXITCODE."
  }
}
finally {
  if (Test-Path -LiteralPath $temporarySqlPath) {
    Remove-Item -LiteralPath $temporarySqlPath -Force
  }
}
