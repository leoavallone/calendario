# 🔌 Documentação Oficial OneFlow (from RoqIA)

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
  "description": "Via WhatsApp do número: +55 (11) 9...."
}
```

---

## 3. Finanças e Caixa (Lançamento Automático via Automação)

A gestão financeira foi migrada para exclusividade de visualização aos usuários com o `role: "owner"`. Como o sistema será alimentado via WhatsApp e as baixas serão diretas, **logo após o n8n criar o agendamento (Passo 2.2)**, você pode engatar um segundo bloco enviando o valor para a rota de Finanças, registrando o pagamento automaticamente!

### 3.1 `POST /api/transactions`
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
