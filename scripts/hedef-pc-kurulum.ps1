# Ofis Yonetim - Hedef PC tek seferlik kurulum
# Yonetici olarak calistirilmalidir (hedef-pc-kurulum.bat ile otomatik)

$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )) {
  Write-Host 'Yonetici yetkisi isteniyor...' -ForegroundColor Yellow
  Start-Process powershell.exe @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$PSCommandPath`""
  ) -Verb RunAs
  exit
}

$AdminUser = 'ofisadmin'
$AdminPassword = 'GucluSifre123!'

function Write-Step($Message) {
  Write-Host "`n>> $Message" -ForegroundColor Cyan
}

try {
  Write-Host ''
  Write-Host '========================================' -ForegroundColor Green
  Write-Host '  Ofis Yonetim - Hedef PC Kurulumu' -ForegroundColor Green
  Write-Host '========================================' -ForegroundColor Green

  Write-Step 'WinRM aciliyor...'
  try {
    Enable-PSRemoting -Force -SkipNetworkProfileCheck
    Write-Host 'WinRM uzaktan erisim hazir.' -ForegroundColor Gray
  }
  catch {
    Write-Host 'Enable-PSRemoting uyarisi, devam ediliyor...' -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor DarkYellow
  }

  Write-Host 'WinRM servisi ayarlaniyor...' -ForegroundColor Gray
  Start-Service WinRM -ErrorAction SilentlyContinue
  Set-Service WinRM -StartupType Automatic

  Write-Host 'Guvenlik duvari kurali kontrol ediliyor...' -ForegroundColor Gray
  try {
    $fwRule = Get-NetFirewallRule -Name 'WINRM-HTTP-In-TCP' -ErrorAction SilentlyContinue
    if ($fwRule) {
      Enable-NetFirewallRule -Name 'WINRM-HTTP-In-TCP' -ErrorAction SilentlyContinue | Out-Null
    }
    netsh advfirewall firewall add rule name='WinRM HTTP (Ofis Yonetim)' dir=in action=allow protocol=TCP localport=5985 2>$null | Out-Null
    Write-Host 'Guvenlik duvari kurali tamam.' -ForegroundColor Gray
  }
  catch {
    Write-Host 'Guvenlik duvari uyarisi (WinRM zaten acik olabilir), devam ediliyor...' -ForegroundColor Yellow
  }

  Write-Step 'Uzak yonetim UAC ayari...'
  New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System `
    -Name LocalAccountTokenFilterPolicy -Value 1 -PropertyType DWord -Force | Out-Null

  Write-Step "Yonetici hesabi: $AdminUser"
  $securePass = ConvertTo-SecureString $AdminPassword -AsPlainText -Force

  if (Get-LocalUser -Name $AdminUser -ErrorAction SilentlyContinue) {
    Set-LocalUser -Name $AdminUser -Password $securePass -PasswordNeverExpires:$true
    Enable-LocalUser -Name $AdminUser
    Write-Host "Mevcut kullanici guncellendi: $AdminUser" -ForegroundColor Gray
  }
  else {
    New-LocalUser -Name $AdminUser -Password $securePass -FullName 'Ofis Admin' -PasswordNeverExpires | Out-Null
    Write-Host "Kullanici olusturuldu: $AdminUser" -ForegroundColor Gray
  }

  Add-LocalGroupMember -Group 'Administrators' -Member $AdminUser -ErrorAction SilentlyContinue
  Add-LocalGroupMember -Group 'Remote Management Users' -Member $AdminUser -ErrorAction SilentlyContinue
  Add-LocalGroupMember -Group 'Uzaktan Yönetim Kullanıcıları' -Member $AdminUser -ErrorAction SilentlyContinue

  Write-Step 'Kontrol...'
  $winrm = Get-Service WinRM
  $pcName = hostname

  Write-Host ''
  Write-Host '========================================' -ForegroundColor Green
  Write-Host '  KURULUM TAMAMLANDI' -ForegroundColor Green
  Write-Host '========================================' -ForegroundColor Green
  Write-Host "WinRM          : $($winrm.Status)"
  Write-Host "Bilgisayar adi : $pcName"
  Write-Host "Kullanici      : $pcName\$AdminUser"
  Write-Host ''
  Write-Host 'Uygulamaya eklerken:' -ForegroundColor Yellow
  Write-Host "  - Bilgisayar adi: $pcName"
  Write-Host '  - Tailscale IP: Tailscale uygulamasindan bakin'
  Write-Host ''
}
catch {
  Write-Host ''
  Write-Host 'HATA:' $_.Exception.Message -ForegroundColor Red
  Write-Host ''
  exit 1
}

Read-Host 'Kapatmak icin Enter tusuna basin'
