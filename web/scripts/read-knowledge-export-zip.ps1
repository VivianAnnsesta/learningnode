param([Parameter(Mandatory = $true)][string]$LiteralPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($PSVersionTable.PSEdition -ne 'Core' -or -not [System.IO.Compression.ZipArchiveEntry].GetProperty('Crc32')) {
  throw 'Independent ZIP verification requires PowerShell Core/.NET with ZipArchiveEntry.Crc32.'
}
$stream = [System.IO.File]::OpenRead($LiteralPath)
$archive = $null
try {
  $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
  if ($archive.Entries.Count -gt 65535) { throw 'ZIP entry limit exceeded.' }
  $entries = [System.Collections.Generic.List[object]]::new()
  [long]$total = 0
  foreach ($entry in $archive.Entries) {
    $total += $entry.Length
    if ($entry.Length -lt 0 -or $total -gt 67108864) { throw 'ZIP payload size limit exceeded.' }
    $inputStream = $entry.Open()
    $memory = [System.IO.MemoryStream]::new()
    try {
      $buffer = [byte[]]::new(81920)
      while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        if ($memory.Length + $read -gt $entry.Length) { throw 'ZIP stream exceeded its declared bounded length.' }
        $memory.Write($buffer, 0, $read)
      }
      $bytes = $memory.ToArray()
    }
    finally { $inputStream.Dispose(); $memory.Dispose() }
    if ($bytes.LongLength -ne $entry.Length) { throw 'ZIP entry length mismatch.' }
    $entries.Add(@{ name = $entry.FullName; bytes = $bytes.Length; crc32 = [long]$entry.Crc32; base64 = [System.Convert]::ToBase64String($bytes) })
  }
  @{ reader = "PowerShell $($PSVersionTable.PSVersion) / $([System.IO.Compression.ZipArchive].Assembly.FullName)"; entries = $entries.ToArray() } | ConvertTo-Json -Depth 5 -Compress
}
finally { if ($archive) { $archive.Dispose() }; $stream.Dispose() }
