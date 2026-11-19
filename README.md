# CRM · Encontro de Alunos (23/01/2027)

CRM em formato de quadro (kanban) para a equipe vender, por ligação, o encontro presencial dos alunos da Formação Corretor de Grãos Elite.

**Colunas de origem:** Enquete do grupo · Caixinha de perguntas · Cakto (Formação Elite) · Compradores do GPS (MS e estados vizinhos)
**Colunas do funil:** Ligou 1 vez → 2 → 3 → 4 → 5 vezes → Atendeu a ligação → Demonstrou interesse → Comprou o ingresso

## Gestor e vendedores

| | Gestor | Vendedor |
|---|---|---|
| O que vê | Todos os leads, com filtro por vendedor | **Somente os leads atribuídos a ele** |
| Dividir leads | ✅ Menu → *Equipe e divisão de leads* | — |
| Trocar o vendedor de um lead | ✅ Na ficha do lead | — |
| Importar CSV | ✅ | — |
| Mover no funil, tarefas, observações | ✅ | ✅ (nos leads dele) |

A restrição é aplicada pelo **próprio banco de dados**, não só pela tela. Um vendedor não consegue ver os leads de outro, mesmo que tente.

### Dividir os leads
Menu com o seu nome → **Equipe e divisão de leads**:
- **Pegar leads de:** *Leads sem vendedor* ou *Leads de [vendedor]*. A segunda opção serve para redistribuir, por exemplo quando alguém sai ou fica sobrecarregado.
- **Origens:** quais colunas de origem entram na divisão.
- **Somente leads que ainda não receberam ligação:** já vem marcado.
- **Dividir entre:** quais vendedores recebem.
- **Quantos por vendedor:** se ficar em branco, divide tudo igualmente. Também dá para soltar em lotes, por exemplo 30 para cada um agora e mais depois.

Antes de confirmar, o CRM mostra quantos leads cada vendedor vai receber. A divisão é feita em rodízio, então cada vendedor recebe uma parte parecida de cada origem. A tabela no topo mostra, para cada vendedor, quantos leads ele ainda não ligou, quantos estão em ligação, quantos atenderam e quantos compraram.

## O que mais dá para fazer

- **Cartão de cada lead** com o nome e o telefone em destaque. Clicar no telefone já liga. Embaixo aparecem as etiquetas de origem.
- **Arrastar o cartão** entre colunas, ou usar o botão **"Registrar ligação sem resposta"**, que passa o lead para a próxima coluna de "Ligou X vezes".
- **Agenda de tarefas:** no dia marcado, a tarefa aparece no 🔔 sininho de quem a criou.
- **Observações** com data e autor, e **histórico** de cada movimentação.
- **Marcar sem interesse:** o lead some do quadro, mas não é apagado.
- **Busca** por nome, telefone ou e-mail, e **Exportar CSV**.

## Instalação

A ordem não importa: você pode criar o repositório no GitHub antes ou depois do banco. Sem o banco, o site abre em **modo demonstração**. O banco precisa estar pronto antes de a equipe começar a usar.

### 1. Criar o banco no Supabase (gratuito)
1. Crie uma conta em https://supabase.com e clique em **New project**. Use a região *South America (São Paulo)*.
2. No menu lateral, abra **SQL Editor**. Cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. **Authentication → Sign In / Providers**: **desligue** *Allow new users to sign up*. Assim ninguém de fora consegue criar conta.

### 2. Cadastrar você (gestor) e a equipe
1. **Authentication → Users → Add user → Create new user**: crie um e-mail e uma senha para você e para cada vendedor, marcando *Auto Confirm User*.
2. Para virar gestor, rode no **SQL Editor** a linha abaixo, trocando pelo seu e-mail:
   ```sql
   update public.perfis set papel = 'admin' where email = 'seu-email@exemplo.com';
   ```
3. No primeiro login, cada pessoa informa o nome. A partir daí ela aparece na tela de divisão.

### 3. Ligar o site ao banco
1. Abra **Project Settings → API** e copie a **Project URL** e a chave **anon public**.
2. Cole as duas no arquivo [`config.js`](config.js). A chave *anon* foi feita para ficar no site. Os dados continuam protegidos pelo login e pelas regras do banco.

### 4. Publicar no GitHub Pages
1. Crie um repositório no GitHub e envie os arquivos desta pasta.
2. Abra **Settings → Pages**, escolha *Deploy from a branch*, a branch `main` e a pasta `/ (root)`, e clique em **Save**.
3. Em 1 ou 2 minutos o endereço `https://SEU-USUARIO.github.io/NOME-DO-REPO/` fica no ar.

### 5. Importar e dividir os leads
1. Entre como gestor e abra o menu com o seu nome → **Importar CSV de leads**. Escolha o arquivo `leads-encontro-23-jan.csv`.
2. Abra o menu → **Equipe e divisão de leads** e divida os leads entre os vendedores.

Se importar o mesmo arquivo de novo, ou um CSV com leads novos, o CRM só **acrescenta** quem ainda não está lá. Os leads novos entram como "sem vendedor", prontos para dividir.

> ⚠️ **LGPD:** nunca suba o CSV de leads para o GitHub. Ele tem telefones e e-mails de clientes. O `.gitignore` já bloqueia qualquer `.csv`.

## Testar no seu computador

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000. Com o `config.js` vazio, você entra como gestor no modo demonstração. Na tela de equipe dá para criar vendedores de teste, e no menu **Ver como** você vê exatamente o que cada vendedor vê.
