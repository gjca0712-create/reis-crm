-- Jeito manual (ou pro suporte do Órbita rodar) do que o `node 0-preparar.js`
-- faz sozinho.
--
-- Cria o usuário que o programa usa pra LER o Órbita. Ele só consegue
-- consultar (SELECT): não grava, não altera e não apaga nada no banco.
--
-- Rode UMA vez, no MySQL do computador do Órbita, logado como root ou como o
-- userdba do Órbita (HeidiSQL, MySQL Workbench ou o "mysql" da linha de
-- comando).
-- Antes de rodar, troque TROQUE_ESTA_SENHA pela senha que vai no .env
-- (MYSQL_SENHA) e, se o banco não se chamar orbitadb, troque o nome também.
--
-- Os dois endereços (localhost e 127.0.0.1) são o próprio computador: o
-- usuário não entra de nenhum outro lugar da rede.

CREATE USER IF NOT EXISTS 'crm_leitura'@'localhost' IDENTIFIED BY 'TROQUE_ESTA_SENHA';
CREATE USER IF NOT EXISTS 'crm_leitura'@'127.0.0.1' IDENTIFIED BY 'TROQUE_ESTA_SENHA';

GRANT SELECT ON orbitadb.* TO 'crm_leitura'@'localhost';
GRANT SELECT ON orbitadb.* TO 'crm_leitura'@'127.0.0.1';

-- Conferência: deve aparecer só "GRANT USAGE" e "GRANT SELECT ON `orbitadb`.*".
SHOW GRANTS FOR 'crm_leitura'@'127.0.0.1';
