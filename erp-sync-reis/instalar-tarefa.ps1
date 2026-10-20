# Cria (ou recria) a tarefa agendada do Windows que roda a sincronizacao com o
# CRM. Roda como SYSTEM: funciona mesmo sem ninguem logado e nao abre janela na
# frente de quem esta usando o computador.
#
# A tarefa roda a cada minuto, mas so manda dados quando alguem aperta
# "Atualizar agora" no CRM ou quando ja deu MINUTOS_ENTRE_ENVIOS (no .env,
# padrao 10) desde a ultima vez. Nos outros minutos ela so pergunta ao CRM e sai.
#
# No PowerShell COMO ADMINISTRADOR, dentro desta pasta:
#   powershell -ExecutionPolicy Bypass -File .\instalar-tarefa.ps1
#   powershell -ExecutionPolicy Bypass -File .\instalar-tarefa.ps1 -Remover
#
# (Sem acentos de proposito: o PowerShell do Windows le .ps1 sem BOM como ANSI.)
param(
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
if (-not (Test-Path (Join-Path $pasta "estado.json"))) {
  Write-Host "Aviso: o primeiro envio ainda nao foi feito. Ele vai acontecer pela tarefa; acompanhe em logs\."
}

$acao = New-ScheduledTaskAction -Execute $node -Argument "`"$pasta\2-sincronizar.js`" --agendado" -WorkingDirectory $pasta
# Sem RepetitionDuration = repete pra sempre, inclusive depois de reiniciar.
$quando = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$quem = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Limited
# IgnoreNew: se uma rodada demorar (o primeiro envio), os minutos seguintes esperam.
$opcoes = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $Nome -Action $acao -Trigger $quando -Principal $quem -Settings $opcoes `
  -Description "Manda vendas, produtos e contas do Orbita (so leitura) pro CRM da Reis. Log em $pasta\logs." -Force | Out-Null

Write-Host "Pronto: '$Nome' instalada, comeca em 1 minuto."
Write-Host "Manda dados a cada MINUTOS_ENTRE_ENVIOS (padrao 10) e atende o 'Atualizar agora' do CRM em ate 1 minuto."
Write-Host "Acompanhe em $pasta\logs - cada envio escreve uma linha 'OK: ...' ou 'ERRO ...'."
