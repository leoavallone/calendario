# 🔌 Documentação Oficial OneFlow (BY RoqIA)

Esta documentação fornece as instruções completas para que sua barbearia possa conectar o sistema de agendamento (via Web e WhatsApp) usando n8n, Evolution API e similares.

**Importante:** Na versão atual, o sistema conta com Perfis de Acesso (*Role*) e **Autenticação (Token)**. 

---

## 1. Autenticação (IMPORTANTE PARA O N8N)
Todas as operações do sistema exigem um token, garantindo que o seu histórico e dados de agendamento fiquem completamente blindados.

### 1.1 `POST /api/auth/register` (Para o N8N raramente usará)
Cria um usuário na loja.
- Corpo JSON: `{"name": "...", "email": "...", "password": "...", "role": "barber"}`.

### 1.2 `POST /api/auth/login` (Requisito para obter o Token)
No n8n, você pode ter um nó (Node) que faz o Login uma vez (ou ao iniciar o fluxo), armazena o token e usa durante toda a árvore de comunicação do cliente no WhatsApp.
- **Corpo JSON:** `{"email": "seu@email.com", "password": "sua_senha"}`
- **Retorno Esperado:** 
  ```json
  {
      "token": "eJhdsfsG1...",
      "user": { "_id": "A40", "name": "Henrique", "role": "owner", ... }
  }
  ```

> **NOTA PARA O N8N:** Guarde a string devolvida dentro de `"token"` e em todos os próximos blocos *HTTP Request* adicione na aba **Headers**:
> * Name: `Authorization`
> * Value: `Bearer {{ $json.token }}` (ou a referência do nó anterior respectiva).

### 1.3 Recuperação de senha por email
Para recuperar senha esquecida, o sistema gera um token temporário e envia um link por email. Configure no ambiente:
* `RESEND_API_KEY`
* `RESET_PASSWORD_FROM` (ex: `OneFlow <no-reply@roqia.com.br>`)
* `APP_BASE_URL` (ex: `https://oneflow.roqia.com.br`)

#### `POST /api/auth/forgot-password`
Solicita o link de recuperação.
```json
{
  "email": "usuario@email.com"
}
```

#### `POST /api/auth/reset-password`
Redefine a senha usando o token recebido por email.
```json
{
  "token": "TOKEN_DO_LINK",
  "password": "nova_senha"
}
```

**Importante multi-cliente:** usuários, agendamentos e financeiro agora são isolados por organização. Um token só consegue listar/alterar dados de usuários vinculados à mesma organização.

### 1.4 Vincular usuário existente à equipe
Use quando um barbeiro já existe no sistema, mas precisa aparecer na agenda do dono da conta.
* **Header:** `Authorization: Bearer <TOKEN_DO_DONO>`
* **Rota:** `POST /api/users/link-existing`
* **Corpo JSON:**
```json
{
  "email": "barbeiro@email.com"
}
```

---

## 2. Agendamentos via WhatsApp

Para que o bot verifique um horário e registre que o cliente quer cortar o cabelo à tarde:

### 2.1 `GET /api/availability`
Verifica os horários disponíveis (Retorna horários limpos vs os horários já preenchidos).
* **Header Mínimo Exigido:** `Authorization: Bearer <SEU_TOKEN>`
* **Query Params:** `userId` (ID do Barbeiro), `date` (Formato Data YYYY-MM-DD).

### 2.2 `POST /api/appointments`
Acionado pelo n8n quando o consumidor confirmar qual horário e data do WhatsApp que ele escolheu. Bloqueia o horário do Barbeiro em Tempo Real.
* **Header:** `Authorization: Bearer <SEU_TOKEN>`
* **Corpo JSON:**
```json
{
  "userId": "ID_DO_BARBEIRO",
  "title": "Corte de Cabelo (Agendado pelo WhatsApp)",
  "date": "2026-05-10",
  "time": "15:30",
  "customerName": "Nome do Cliente",
  "phone": "+55 (11) 99999-9999",
  "description": "Via WhatsApp do número: +55 (11) 9...."
}
```

Ao enviar `phone`, o sistema cria ou atualiza automaticamente o cadastro do cliente dentro da organização. Esse dado alimenta relatórios anuais e histórico de recorrência.

### 2.3 `GET /api/appointments/by-phone`
Lista os agendamentos vinculados a um número de telefone. Funciona tanto para novos agendamentos com o campo `phone` quanto para registros antigos onde o número ficou dentro de `description`.
* **Header:** `Authorization: Bearer <SEU_TOKEN>`
* **Query Params:** `phone` obrigatório, `userId` opcional.
* **Exemplo:** `/api/appointments/by-phone?phone=5511999999999`

### 2.4 `GET /api/appointments/by-date`
Lista os agendamentos de um dia. Útil para automações de lembrete, por exemplo buscar hoje os clientes agendados para amanhã.
* **Header:** `Authorization: Bearer <SEU_TOKEN>`
* **Query Params:** `date` obrigatório no formato `YYYY-MM-DD`, `userId` opcional.
* **Exemplo geral:** `/api/appointments/by-date?date=2026-05-10`
* **Exemplo por profissional:** `/api/appointments/by-date?date=2026-05-10&userId=ID_DO_BARBEIRO`

### 2.5 `POST /api/appointments/cancel`
Cancela um agendamento pelo `appointmentId` ou pelo telefone. Para evitar cancelamento errado, se o telefone encontrar mais de um agendamento, a API retorna `409` com a lista e pede para informar `appointmentId`, `date` ou `time`.
* **Header:** `Authorization: Bearer <SEU_TOKEN>`
* **Corpo JSON por telefone:**
```json
{
  "phone": "5511999999999",
  "date": "2026-05-10",
  "time": "15:30"
}
```
* **Corpo JSON por ID:**
```json
{
  "appointmentId": "ID_DO_AGENDAMENTO"
}
```

---

## 3. Clientes e Relatórios

### 3.1 `GET /api/customers`
Lista clientes da organização. Aceita busca por nome ou telefone.
* **Header:** `Authorization: Bearer <SEU_TOKEN>`
* **Exemplo:** `/api/customers?search=5511999999999`

### 3.2 `GET /api/customers/report`
Gera ranking de clientes por quantidade de agendamentos em um ano.
* **Header:** `Authorization: Bearer <SEU_TOKEN>`
* **Query Params:** `year` opcional, padrão ano atual.
* **Exemplo:** `/api/customers/report?year=2026`

### 3.3 `GET /api/customers/:id/appointments`
Lista o histórico de agendamentos de um cliente.
* **Header:** `Authorization: Bearer <SEU_TOKEN>`

### 3.4 `PUT /api/users/:id/commission`
Define o percentual de comissão de um profissional. Apenas `owner`.
* **Header:** `Authorization: Bearer <TOKEN_DO_DONO>`
* **Corpo JSON:**
```json
{
  "commissionRate": 40
}
```

---

## 4. Finanças e Caixa (Lançamento Automático via Automação)

A gestão financeira foi migrada para exclusividade de visualização aos usuários com o `role: "owner"`. Como o sistema será alimentado via WhatsApp e as baixas serão diretas, **logo após o n8n criar o agendamento (Passo 2.2)**, você pode engatar um segundo bloco enviando o valor para a rota de Finanças, registrando o pagamento automaticamente!

### 4.1 `POST /api/transactions`
* **Header:** `Authorization: Bearer <SEU_TOKEN>`
* **Corpo JSON (Exemplo após o ciente agendar e pagar):**
```json
{
  "userId": "ID_DO_BARBEIRO_OU_LOJA",
  "type": "income",
  "amount": 50.00,
  "description": "Corte Agendado no WhatsApp",
  "date": "2026-05-10"
}
```

> **Fluxo de Automação Recomendado (N8N + Evolution API):**
> 1. Recebe a mensagem com o Evolution API (Gatilho).
> 2. IA verifica horários disponíveis `GET /api/availability`.
> 3. Cliente confirma.
> 4. Nó HTTP 1: Envia `POST /api/appointments` para reservar na tela de todos.
> 5. Nó HTTP 2 (A reboque do HTTP 1): Envia `POST /api/transactions` para jogar o valor nos lucros do mês.
