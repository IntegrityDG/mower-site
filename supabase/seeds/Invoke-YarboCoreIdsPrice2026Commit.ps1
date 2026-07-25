param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(0, 1)]
  [int]$ExpectedUpdateCount
)

$ErrorActionPreference = "Stop"

$seedPath = Join-Path $PSScriptRoot "yarbo-core-ids-price-2026.sql"
$expectedSha256 = "9098b2021b30c921f3ca8f03d90f5a6f1908f5ec0a9bfaba1e63653f876ac2d1"
$actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $seedPath).Hash.ToLowerInvariant()

if ($actualSha256 -ne $expectedSha256) {
  throw "Refusing permanent Yarbo Core pricing run: reviewed seed SHA-256 changed."
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
  throw "Refusing permanent Yarbo Core pricing run: first executable statement is not BEGIN."
}

if ($lastExecutable -ne "ROLLBACK;") {
  throw "Refusing permanent Yarbo Core pricing run: reviewed seed does not end with ROLLBACK."
}

if ($rollbackSql -match "(?im)^\s*(CREATE|ALTER|DROP|TRUNCATE)\b") {
  throw "Refusing permanent Yarbo Core pricing run: reviewed seed contains DDL."
}

if ($rollbackSql -match "(?im)^\s*COMMIT\s*;") {
  throw "Refusing permanent Yarbo Core pricing run: reviewed seed already contains COMMIT."
}

$countGuard = @"
DO `$permanent_guard`$
DECLARE
  actual_update_count integer;
BEGIN
  actual_update_count := (
    current_setting('ids.yarbo_core_price_report', true)::jsonb
      ->> 'updated_count'
  )::integer;

  IF actual_update_count <> $ExpectedUpdateCount THEN
    RAISE EXCEPTION
      'Expected permanent Yarbo Core update count $ExpectedUpdateCount; found %.',
      actual_update_count;
  END IF;
END
`$permanent_guard`$;

COMMIT;
"@

$commitSql = [regex]::Replace(
  $rollbackSql,
  "ROLLBACK;\s*\z",
  $countGuard,
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

if ($commitSql -eq $rollbackSql) {
  throw "Refusing permanent Yarbo Core pricing run: terminal ROLLBACK replacement failed."
}

$temporarySqlPath = Join-Path (
  [System.IO.Path]::GetTempPath()
) "yarbo-core-ids-price-2026-$([guid]::NewGuid().ToString('N')).sql"

try {
  [System.IO.File]::WriteAllText(
    $temporarySqlPath,
    $commitSql,
    [System.Text.UTF8Encoding]::new($false)
  )

  & npx.cmd --yes supabase@2.109.1 db query --linked --file $temporarySqlPath --output-format json

  if ($LASTEXITCODE -ne 0) {
    throw "Permanent Yarbo Core pricing command failed with exit code $LASTEXITCODE."
  }
}
finally {
  if (Test-Path -LiteralPath $temporarySqlPath) {
    Remove-Item -LiteralPath $temporarySqlPath -Force
  }
}
