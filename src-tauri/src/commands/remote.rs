//! Remote PC management via PowerShell WinRM (Invoke-Command).

use std::path::PathBuf;
use std::process::Command;
use std::thread;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::types::validate_string_input;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ManagedPc {
    pub id: String,
    pub name: String,
    /// Tailscale IP or hostname
    pub address: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RemoteOperationResult {
    pub pc_id: String,
    pub pc_name: String,
    pub address: String,
    pub success: bool,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PcConnectionStatus {
    pub pc_id: String,
    pub pc_name: String,
    pub address: String,
    pub online: bool,
    pub message: String,
}

fn pcs_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Uygulama dizini alınamadı: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Dizin oluşturulamadı: {e}"))?;
    Ok(dir.join("managed_pcs.json"))
}

fn run_powershell(script: &str) -> (bool, String) {
    let output = match Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
    {
        Ok(o) => o,
        Err(e) => return (false, format!("PowerShell başlatılamadı: {e}")),
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        let combined = if stderr.is_empty() {
            stdout
        } else if stdout.is_empty() {
            stderr
        } else {
            format!("{stdout}\n{stderr}")
        };
        (true, combined)
    } else {
        let message = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Komut başarısız oldu".to_string()
        };
        (false, message)
    }
}

fn escape_ps_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

fn invoke_on_host(address: &str, user_script: &str) -> (bool, String) {
    let address = escape_ps_single_quoted(address);
    let user_script = escape_ps_single_quoted(user_script);

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
try {{
  $result = Invoke-Command -ComputerName '{address}' -ScriptBlock ([scriptblock]::Create('{user_script}')) -ErrorAction Stop
  if ($null -eq $result) {{ 'OK (çıktı yok)' }} else {{ ($result | Out-String).Trim() }}
}} catch {{
  $_.Exception.Message
  exit 1
}}
"#
    );

    run_powershell(&script)
}

fn copy_file_to_host(address: &str, local_path: &str, remote_dir: &str) -> (bool, String) {
    let address = escape_ps_single_quoted(address);
    let local_path = escape_ps_single_quoted(local_path);
    let remote_dir = escape_ps_single_quoted(remote_dir.trim_end_matches('\\'));

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
try {{
  $fileName = Split-Path -Leaf '{local_path}'
  $dest = '{remote_dir}\' + $fileName
  Copy-Item -LiteralPath '{local_path}' -Destination $dest -ToSession (New-PSSession -ComputerName '{address}') -Force
  "Dosya kopyalandı: $dest"
}} catch {{
  $_.Exception.Message
  exit 1
}}
"#
    );

    run_powershell(&script)
}

/// Loads saved PC list from disk.
#[tauri::command]
#[specta::specta]
pub async fn load_managed_pcs(app: AppHandle) -> Result<Vec<ManagedPc>, String> {
    let path = pcs_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("PC listesi okunamadı: {e}"))?;
    serde_json::from_str(&contents).map_err(|e| format!("PC listesi ayrıştırılamadı: {e}"))
}

/// Saves PC list to disk.
#[tauri::command]
#[specta::specta]
pub async fn save_managed_pcs(app: AppHandle, pcs: Vec<ManagedPc>) -> Result<(), String> {
    for pc in &pcs {
        validate_string_input(&pc.name, 100, "PC adı")?;
        validate_string_input(&pc.address, 253, "Adres")?;
    }

    let path = pcs_path(&app)?;
    let json = serde_json::to_string_pretty(&pcs).map_err(|e| format!("JSON hatası: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("PC listesi kaydedilemedi: {e}"))
}

/// Checks connectivity to selected PCs via Test-Connection.
#[tauri::command]
#[specta::specta]
pub async fn check_pc_connections(pcs: Vec<ManagedPc>) -> Result<Vec<PcConnectionStatus>, String> {
    let handles: Vec<_> = pcs
        .into_iter()
        .map(|pc| {
            thread::spawn(move || {
                let address = escape_ps_single_quoted(&pc.address);
                let script = format!(
                    "if (Test-Connection -ComputerName '{address}' -Count 1 -Quiet) {{ 'online' }} else {{ 'offline' }}"
                );
                let (ok, output) = run_powershell(&script);
                let online = ok && output.to_lowercase().contains("online");
                PcConnectionStatus {
                    pc_id: pc.id,
                    pc_name: pc.name,
                    address: pc.address,
                    online,
                    message: if online {
                        "Erişilebilir".to_string()
                    } else {
                        output
                    },
                }
            })
        })
        .collect();

    Ok(handles
        .into_iter()
        .filter_map(|h| h.join().ok())
        .collect())
}

/// Runs a PowerShell script on multiple remote PCs via WinRM.
#[tauri::command]
#[specta::specta]
pub async fn run_remote_command(
    pcs: Vec<ManagedPc>,
    command: String,
) -> Result<Vec<RemoteOperationResult>, String> {
    validate_string_input(&command, 8000, "Komut")?;

    let handles: Vec<_> = pcs
        .into_iter()
        .map(|pc| {
            let command = command.clone();
            thread::spawn(move || {
                let (success, output) = invoke_on_host(&pc.address, &command);
                RemoteOperationResult {
                    pc_id: pc.id,
                    pc_name: pc.name,
                    address: pc.address,
                    success,
                    output,
                }
            })
        })
        .collect();

    Ok(handles
        .into_iter()
        .filter_map(|h| h.join().ok())
        .collect())
}

/// Copies a local file to remote PCs via WinRM PSSession.
#[tauri::command]
#[specta::specta]
pub async fn deploy_file_to_pcs(
    pcs: Vec<ManagedPc>,
    local_path: String,
    remote_dir: String,
) -> Result<Vec<RemoteOperationResult>, String> {
    validate_string_input(&local_path, 500, "Dosya yolu")?;
    validate_string_input(&remote_dir, 500, "Uzak dizin")?;

    if !std::path::Path::new(&local_path).exists() {
        return Err(format!("Dosya bulunamadı: {local_path}"));
    }

    let handles: Vec<_> = pcs
        .into_iter()
        .map(|pc| {
            let local_path = local_path.clone();
            let remote_dir = remote_dir.clone();
            thread::spawn(move || {
                let (success, output) =
                    copy_file_to_host(&pc.address, &local_path, &remote_dir);
                RemoteOperationResult {
                    pc_id: pc.id,
                    pc_name: pc.name,
                    address: pc.address,
                    success,
                    output,
                }
            })
        })
        .collect();

    Ok(handles
        .into_iter()
        .filter_map(|h| h.join().ok())
        .collect())
}
