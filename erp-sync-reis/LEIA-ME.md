# Sincronização Órbita → CRM da Reis

Programa que roda no computador do Órbita. A cada 10 minutos ele lê o banco
(MySQL) e manda para o CRM: produtos (preço, custo, estoque), vendas (itens,
pagamentos, custo da época), contas a receber e contas a pagar. As telas
**Financeiro** e **Produtos** do CRM mostram esses números, e o botão
**Atualizar agora** delas faz o programa mandar na hora (em até 1 minuto).

- **Só lê.** Usa um usuário do MySQL que só tem permissão de consulta: não
  grava, não altera e não apaga nada no Órbita.
- **Não abre porta nenhuma.** Só sai para a internet (HTTPS) até o CRM, com uma
  chave que só o programa e o CRM conhecem.
- **Manda só o que mudou.** O primeiro envio leva o último ano de vendas;
  depois disso, cada rodada leva segundos.
- Sem internet ou com o computador desligado, nada se perde: a próxima rodada
  continua de onde parou.

## O que precisa

- O computador onde fica o **MySQL do Órbita** (o "servidor" da loja), ligado
  durante o expediente.
- **Node.js 20 ou mais novo**: baixe a versão LTS em https://nodejs.org e
  instale com as opções padrão.
- A senha do usuário `root` do MySQL do Órbita (só para criar o usuário de
  leitura, uma vez).

## Instalação (uma vez)

1. **Copie esta pasta** para `C:\erp-sync-reis` no computador do Órbita
   (pelo AnyDesk dá pra copiar e colar). Não copie `node_modules`, `.env`,
   `estado.json` nem `logs` (se existirem).

2. **Instale as dependências.** Abra o Prompt de Comando nessa pasta e rode:

   ```bat
   cd C:\erp-sync-reis
   npm install
   ```

3. **Prepare o banco e o `.env`.**

   ```bat
   node 0-preparar.js
   ```

   Ele pede um **usuário administrador do MySQL** e a senha dele, uma vez. A
   senha não aparece enquanto você digita e não fica salva em lugar nenhum.

   Sem a senha do `root`, use o usuário com que o próprio Órbita entra no
   banco, o `userdba`. O usuário e a senha dele ficam no arquivo `user.config`
   do Adm.exe, no perfil do Windows de quem usa o Órbita:
   `%LOCALAPPDATA%\Generico\Adm.exe_Url_...\<versão>\user.config`. Abra no
   Bloco de Notas e procure o campo da senha.

   Com o usuário e a senha, o programa:

   - cria o usuário `crm_leitura`, que só consegue consultar, com uma senha
     aleatória;
   - cria o `.env` já preenchido com esse usuário;
   - gera a chave do CRM e mostra na tela. Copie essa chave, que vai no passo 5.

   Se o banco não se chamar `orbitadb`, crie o `.env` a partir do
   `.env.exemplo`, troque o `MYSQL_BANCO` e rode de novo. Se for o suporte do
   Órbita quem vai criar o usuário, mande pra eles o `criar-usuario-leitura.sql`.

4. **Confira o banco.**

   ```bat
   node 1-conferir-banco.js
   ```

   Essa conferência só lê e só mostra contagens e totais. No fim tem que
   aparecer **"Tudo certo pra ligar"**. Se aparecerem avisos, resolva antes de
   seguir. Repare também em:

   - **Usuário só de leitura: OK**
   - **Empresas no banco**: se aparecer mais de uma, coloque o número da Reis em
     `ID_EMPRESA` no `.env`.
   - **Os valores fecham?**: diferença entre a nota, os itens e os pagamentos.
   - **Tempo das leituras** do programa neste computador.

5. **Coloque a chave no Railway.** No serviço do CRM: **Variables → New
   Variable**, nome `ERP_SYNC_KEY`, valor = a chave que o passo 3 mostrou. Ela
   também está no `.env`, na linha `ERP_SYNC_KEY`. O Railway publica de novo
   sozinho; espere terminar.

   Não mande essa chave por WhatsApp nem e-mail: quem tiver a chave consegue
   gravar dados no CRM.

6. **Simule.**

   ```bat
   node 2-sincronizar.js --simular
   ```

   Lê tudo e mostra quanto mandaria, **sem mandar nada**.

7. **Faça o primeiro envio na mão.**

   ```bat
   node 2-sincronizar.js
   ```

   Esse envio leva o ano inteiro e pode demorar alguns minutos. **Os dados de
   demonstração do CRM são apagados nesse primeiro envio.** Se a internet cair
   no meio, rode de novo: ele continua de onde parou.

8. **Compare com o Órbita** antes de confiar nos números:

   - o faturamento de ontem e do mês no painel do Órbita contra o
     **Financeiro** do CRM;
   - o estoque e o preço de 3 produtos;
   - um cliente com conta a receber em aberto.

9. **Ligue a tarefa automática.** Abra o PowerShell **como administrador**
    (botão direito → Executar como administrador) e rode:

    ```bat
    cd C:\erp-sync-reis
    powershell -ExecutionPolicy Bypass -File .\instalar-tarefa.ps1
    ```

    A tarefa roda mesmo sem ninguém logado e não abre janela na tela. A cada
    minuto ela pergunta ao CRM se alguém apertou **Atualizar agora**: se sim,
    manda na hora; se não, só manda a cada 10 minutos. Para outro intervalo,
    mude `MINUTOS_ENTRE_ENVIOS` no `.env` (não precisa reinstalar a tarefa).

## Dia a dia

- No CRM, no topo do Financeiro e de Produtos, aparece **"Atualizado com o
  ERP há X min"**. Se passar de 30 min, a tela avisa que o programa pode
  estar parado. É normal à noite e no fim de semana, com o computador
  desligado: os números continuam lá, só não atualizam.
- O botão **Atualizar agora**, ao lado, pede um envio na hora. A tela recarrega
  sozinha quando os dados chegam, em até 1 minuto. Com o computador da loja
  desligado, ela avisa que ele não respondeu.
- Cada envio escreve uma linha em `logs\AAAA-MM.log`, por exemplo
  `OK: 0 produtos, 3 vendas, 1 a receber, 0 a pagar (2 s).` Os envios pedidos
  pelo botão terminam com `— pedido pelo CRM`. Os logs dos
  últimos 6 meses ficam guardados. O log não tem nome de cliente nem valor de
  título.
- Uma vez por dia acontece uma **conferência completa**: o programa relê o ano
  inteiro de vendas, para pegar cancelamentos antigos e DAV faturado depois. Essa
  rodada demora um pouco mais.

## Problemas comuns

| Mensagem no log | O que fazer |
| --- | --- |
| `MySQL não respondeu` | O MySQL/Órbita está ligado neste computador? Confira `MYSQL_HOST` e `MYSQL_PORT`. |
| `MySQL recusou usuário/senha` | Rode `node 0-preparar.js` de novo (passo 3): ele refaz o usuário e o `.env`. |
| `CRM recusou a chave (401)` | A `ERP_SYNC_KEY` do `.env` tem que ser exatamente a mesma do Railway. |
| `Sem conexão com o CRM` | Sem internet. Não precisa fazer nada: a próxima rodada manda. |
| `... recusado pelo CRM — ...` | Um registro com valor fora do normal no Órbita (preço gigante, por exemplo). Os outros seguem normais. Corrija no Órbita e ele vai sozinho. |
| `Outra sincronização ainda está rodando` | Normal enquanto o primeiro envio ou a conferência completa não terminam. |

## Comandos

| Comando | O que faz |
| --- | --- |
| `node 0-preparar.js` | Cria (ou refaz) o usuário só de leitura e o `.env`. Pede a senha do root. |
| `node 1-conferir-banco.js` | Confere o banco (só leitura, só contagens). |
| `node 2-sincronizar.js --simular` | Mostra o que mandaria, sem mandar. |
| `node 2-sincronizar.js` | Um envio agora, na mão. |
| `node 2-sincronizar.js --tudo` | Esquece o que já mandou e manda tudo de novo. Não duplica nada no CRM. |
| `powershell -ExecutionPolicy Bypass -File .\instalar-tarefa.ps1 -Remover` | Desliga a tarefa automática (como administrador). |

## Segurança

- O `.env` tem a senha do MySQL e a chave do CRM: não compartilhe o arquivo e
  não o copie para outros computadores.
- Use só o usuário `crm_leitura`, nunca o `root`. A conferência (passo 4) avisa
  se o usuário puder gravar.
- Não abra a porta 3306 do MySQL para a internet. O programa roda no mesmo
  computador do banco e não precisa disso.
