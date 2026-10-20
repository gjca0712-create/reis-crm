# Cria (ou recria) a tarefa agendada do Windows que roda a sincronizacao com o
# CRM de tempos em tempos. Roda como SYSTEM: funciona mesmo sem ninguem logado
# e nao abre janela na frente de quem esta usando o computador.
#
# No PowerShell COMO ADMINISTRADOR, dentro desta pasta:
#   powershell -ExecutionPolicy Bypass -File .\instalar-tarefa.ps1
#   powershell -ExecutionPolicy Bypass -File .\instalar-tarefa.ps1 -Minutos 15
#   powershell -ExecutionPolicy Bypass -File .\instalar-tarefa.ps1 -Remover
#
# (Sem acentos de proposito: o PowerShell do Windows le .ps1 sem BOM como ANSI.)
param(
  [int]$Minutos = 10,
  [switch]$Remover
)
$ErrorActionPreference = "Stop"
$Nome = "CRM Reis - sincronizar Orbita"

$eu = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $eu.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Abra o PowerShell como administrador (botao direito > Executar como administrador)."
  exit 1
}

if ($Remover) {
  Unregister-ScheduledTask -TaskName $Nome -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarefa '$Nome' removida."
  exit 0
}

$pasta = $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "Node.js nao encontrado. Instale o Node 20 ou mais novo (nodejs.org) e abra outro PowerShell."
  exit 1
}
foreach ($falta in @(".env", "node_modules")) {
  if (-not (Test-Path (Join-Path $pasta $falta))) {
    Write-Host "Falta '$falta' nesta pasta. Siga o LEIA-ME.md antes de instalar a tarefa."
    exit 1
  }
}
if ($Minutos -lt 5) {
  Write-Host "Use pelo menos 5 minutos."
  exit 1
}
if (-not (Test-Path (Join-Path $pasta "estado.json"))) {
  Write-Host "Aviso: o primeiro envio ainda nao foi feito. Ele vai acontecer pela tarefa; acompanhe em logs\."
}

$acao = New-ScheduledTaskAction -Execute $node -Argument "`"$pasta\2-sincronizar.js`"" -WorkingDirectory $pasta
# Sem RepetitionDuration = repete pra sempre, inclusive depois de reiniciar.
$quando = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutos)
$quem = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Limited
# IgnoreNew: se uma rodada demorar (o primeiro envio), a proxima espera.
$opcoes = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $Nome -Action $acao -Trigger $quando -Principal $quem -Settings $opcoes `
  -Description "Manda vendas, produtos e contas do Orbita (so leitura) pro CRM da Reis. Log em $pasta\logs." -Force | Out-Null

Write-Host "Pronto: '$Nome' roda a cada $Minutos minutos (a primeira em 1 minuto)."
Write-Host "Acompanhe em $pasta\logs - cada rodada escreve uma linha 'OK: ...' ou 'ERRO ...'."
