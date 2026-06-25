$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::UTF8
[Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8

$Sessions = @{}

function Get-SessionKey([string]$Address, [string]$Username) {
  return "$Address|$Username"
}

function Get-RemoteSession([string]$Address, [string]$Username, [string]$Password) {
  $key = Get-SessionKey $Address $Username
  if ($Sessions.ContainsKey($key)) {
    $existing = $Sessions[$key]
    if ($existing.State -eq 'Opened') {
      return $existing
    }
    Remove-PSSession $existing -ErrorAction SilentlyContinue
    $Sessions.Remove($key)
  }

  $secure = ConvertTo-SecureString $Password -AsPlainText -Force
  $cred = New-Object System.Management.Automation.PSCredential($Username, $secure)
  $session = New-PSSession -ComputerName $Address -Credential $cred
  $Sessions[$key] = $session
  return $session
}

function Browse-Remote([System.Management.Automation.Runspaces.PSSession]$Session, [string]$Target, [bool]$IncludeFiles) {
  Invoke-Command -Session $Session -ScriptBlock {
    param($path, $withFiles)

    function Get-QuickFolders {
      @(
        @{ label = 'Masaustu'; path = [Environment]::GetFolderPath('Desktop') },
        @{ label = 'Belgeler'; path = [Environment]::GetFolderPath('MyDocuments') },
        @{ label = 'Temp'; path = $env:TEMP }
      ) | Where-Object { $_.path -and (Test-Path -LiteralPath $_.path) }
    }

    if ([string]::IsNullOrWhiteSpace($path)) {
      $drives = @(Get-PSDrive -PSProvider FileSystem | ForEach-Object {
        @{ name = ($_.Name + ':'); path = $_.Root; type = 'drive' }
      })
      return @{
        path = ''
        parent = $null
        entries = $drives
        quick_folders = @(Get-QuickFolders)
      }
    }

    if (-not (Test-Path -LiteralPath $path)) {
      throw "Klasor bulunamadi: $path"
    }

    $item = Get-Item -LiteralPath $path -Force
    $parent = if ($item.PSDrive.Root -eq $item.FullName) {
      ''
    }
    elseif ($item.Parent) {
      $item.Parent.FullName
    }
    else {
      $null
    }

    $folderEntries = @(Get-ChildItem -LiteralPath $path -Directory -Force -ErrorAction SilentlyContinue |
      Sort-Object Name |
      ForEach-Object {
        @{ name = $_.Name; path = $_.FullName; type = 'folder' }
      })

    $fileEntries = @()
    if ($withFiles) {
      $fileEntries = @(Get-ChildItem -LiteralPath $path -File -Force -ErrorAction SilentlyContinue |
        Sort-Object Name |
        ForEach-Object {
          @{
            name = $_.Name
            path = $_.FullName
            type = 'file'
            size_bytes = [long]$_.Length
          }
        })
    }

    $entries = @($folderEntries) + @($fileEntries)

    @{
      path = $item.FullName
      parent = $parent
      entries = $entries
      quick_folders = @()
    }
  } -ArgumentList $Target, $IncludeFiles
}

function Write-Response($Response) {
  $json = $Response | ConvertTo-Json -Compress -Depth 12
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

Write-Response @{ ready = $true }

while ($true) {
  $line = [Console]::In.ReadLine()
  if ([string]::IsNullOrWhiteSpace($line)) { continue }

  $req = $null
  try {
    $req = $line | ConvertFrom-Json
  }
  catch {
    continue
  }

  try {
    switch ($req.op) {
      'browse' {
        $session = Get-RemoteSession $req.address $req.username $req.password
        $includeFiles = [bool]$req.includeFiles
        $data = Browse-Remote $session $req.path $includeFiles
        Write-Response @{ id = $req.id; success = $true; data = $data }
      }
      'invoke' {
        $session = Get-RemoteSession $req.address $req.username $req.password
        $result = Invoke-Command -Session $session -ScriptBlock ([scriptblock]::Create([string]$req.script))
        $output = if ($null -eq $result) {
          'OK (cikti yok)'
        }
        else {
          ($result | Out-String).Trim()
        }
        Write-Response @{ id = $req.id; success = $true; output = $output }
      }
      'banner' {
        $session = Get-RemoteSession $req.address $req.username $req.password
        $banner = Invoke-Command -Session $session -ScriptBlock {
          $version = $PSVersionTable.PSVersion.ToString()
          $os = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue).Caption
          if (-not $os) { $os = 'Windows' }
          @(
            'Uzak PowerShell oturumu'
            "Bilgisayar: $env:COMPUTERNAME"
            "OS: $os"
            "PowerShell: $version"
            ''
          ) -join "`n"
        }
        Write-Response @{ id = $req.id; success = $true; output = [string]$banner }
      }
      'prompt' {
        $session = Get-RemoteSession $req.address $req.username $req.password
        $prompt = Invoke-Command -Session $session -ScriptBlock {
          "PS $((Get-Location).Path)> "
        }
        Write-Response @{ id = $req.id; success = $true; output = [string]$prompt }
      }
      'desktop' {
        $session = Get-RemoteSession $req.address $req.username $req.password
        $desktop = Invoke-Command -Session $session -ScriptBlock {
          [Environment]::GetFolderPath('Desktop')
        }
        Write-Response @{ id = $req.id; success = $true; output = [string]$desktop }
      }
      'shell' {
        $session = Get-RemoteSession $req.address $req.username $req.password
        $line = [string]$req.line
        $output = Invoke-Command -Session $session -ScriptBlock {
          param($CommandLine)

          $ErrorActionPreference = 'Continue'
          $builder = [System.Text.StringBuilder]::new()

          try {
            $items = @(Invoke-Expression $CommandLine 2>&1)
            foreach ($item in $items) {
              if ($null -eq $item) { continue }
              if ($item -is [System.Management.Automation.ErrorRecord]) {
                [void]$builder.AppendLine($item.ToString())
              }
              elseif ($item -is [System.Management.Automation.WarningRecord]) {
                [void]$builder.AppendLine($item.Message)
              }
              else {
                $text = ($item | Out-String).TrimEnd("`r", "`n")
                if ($text) { [void]$builder.AppendLine($text) }
              }
            }
          }
          catch {
            [void]$builder.AppendLine($_.Exception.Message)
          }

          $builder.ToString().TrimEnd("`r", "`n")
        } -ArgumentList $line

        Write-Response @{ id = $req.id; success = $true; output = [string]$output }
      }
      'complete' {
        $session = Get-RemoteSession $req.address $req.username $req.password
        $line = [string]$req.line
        $cursor = [int]$req.cursor
        if ($cursor -lt 0 -or $cursor -gt $line.Length) {
          $cursor = $line.Length
        }

        $data = Invoke-Command -Session $session -ScriptBlock {
          param($InputLine, $CursorIndex)

          $parsed = [System.Management.Automation.CommandCompletion]::MapStringInputToParsedInput(
            $InputLine,
            $CursorIndex
          )
          $completions = [System.Management.Automation.CommandCompletion]::CompleteInput(
            $parsed.Item1,
            $parsed.Item2,
            $null,
            [System.Management.Automation.CommandCompletion]::GetCommandCompletionHandler()
          )

          $matchTexts = @(
            $completions.CompletionMatches |
              ForEach-Object { [string]$_.CompletionText }
          )

          @{
            currentMatch = [string]$completions.CurrentMatch
            replacementIndex = [int]$completions.ReplacementIndex
            replacementLength = [int]$completions.ReplacementLength
            matches = $matchTexts
          }
        } -ArgumentList $line, $cursor

        Write-Response @{ id = $req.id; success = $true; data = $data }
      }
      'copy' {
        $session = Get-RemoteSession $req.address $req.username $req.password
        $destDir = [string]$req.remoteDir
        if (-not (Test-Path -LiteralPath $destDir)) {
          New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        $fileName = [string]$req.fileName
        if ([string]::IsNullOrWhiteSpace($fileName)) {
          $fileName = Split-Path -Leaf ([string]$req.localPath)
        }
        $dest = Join-Path $destDir $fileName
        Copy-Item -LiteralPath ([string]$req.localPath) -Destination $dest -ToSession $session -Force
        Write-Response @{ id = $req.id; success = $true; output = "Dosya kopyalandı: $dest" }
      }
      'fetch' {
        $session = Get-RemoteSession $req.address $req.username $req.password
        $remotePath = [string]$req.remotePath
        $localPath = [string]$req.localPath

        $stagingResult = Invoke-Command -Session $session -ScriptBlock {
          param($target)

          if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
            throw "Dosya bulunamadi: $target"
          }

          function New-StagingSnapshot {
            param([string]$SourcePath)

            $leaf = Split-Path -Leaf $SourcePath
            $staging = Join-Path $env:TEMP ("ofis-fetch-" + [guid]::NewGuid().ToString('N') + "-" + $leaf)
            $share = [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete

            try {
              $inStream = [System.IO.File]::Open(
                $SourcePath,
                [System.IO.FileMode]::Open,
                [System.IO.FileAccess]::Read,
                $share
              )
              try {
                $outStream = [System.IO.File]::Create($staging)
                try {
                  $inStream.CopyTo($outStream)
                }
                finally {
                  $outStream.Dispose()
                }
              }
              finally {
                $inStream.Dispose()
              }
              return @{ path = $staging; method = 'shared-read' }
            }
            catch {
              $sharedReadError = $_
            }

            $srcDir = Split-Path -Parent $SourcePath
            $robolog = Join-Path $env:TEMP ("ofis-robolog-" + [guid]::NewGuid().ToString('N') + ".txt")
            $null = & robocopy $srcDir $env:TEMP $leaf /B /R:2 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP /LOG:$robolog
            $exitCode = $LASTEXITCODE
            $candidate = Join-Path $env:TEMP $leaf

            if ($exitCode -lt 8 -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
              if ($candidate -ne $staging) {
                Move-Item -LiteralPath $candidate -Destination $staging -Force
              }
              Remove-Item -LiteralPath $robolog -Force -ErrorAction SilentlyContinue
              return @{ path = $staging; method = 'robocopy-backup' }
            }

            Remove-Item -LiteralPath $robolog -Force -ErrorAction SilentlyContinue
            if ($sharedReadError) {
              throw $sharedReadError
            }
            throw "Dosya kopyalanamadi (kilitli veya erisilemez): $SourcePath"
          }

          return (New-StagingSnapshot -SourcePath $target)
        } -ArgumentList $remotePath

        $stagingPath = [string]$stagingResult.path
        $copyMethod = [string]$stagingResult.method

        $parent = Split-Path -Parent $localPath
        if ($parent -and -not (Test-Path -LiteralPath $parent)) {
          New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }

        Copy-Item -LiteralPath $stagingPath -Destination $localPath -FromSession $session -Force

        Invoke-Command -Session $session -ScriptBlock {
          param($staging)
          Remove-Item -LiteralPath $staging -Force -ErrorAction SilentlyContinue
        } -ArgumentList $stagingPath | Out-Null

        $sizeMb = [math]::Round((Get-Item -LiteralPath $localPath).Length / 1MB, 2)
        $methodNote = if ($copyMethod -eq 'shared-read') {
          ' (paylasimli okuma)'
        }
        else {
          ' (yedek modu)'
        }
        Write-Response @{ id = $req.id; success = $true; output = "Dosya alindi: $localPath ($sizeMb MB)$methodNote" }
      }
      default {
        throw "Bilinmeyen islem: $($req.op)"
      }
    }
  }
  catch {
    Write-Response @{ id = $req.id; success = $false; error = $_.Exception.Message }
  }
}
