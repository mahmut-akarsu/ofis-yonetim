@echo off
title Ofis Yonetim - Hedef PC Kurulumu
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0hedef-pc-kurulum.ps1"
