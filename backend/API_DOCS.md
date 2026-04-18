# 🔌 Documentação da API RoqIA (Integração n8n)

Esta documentação fornece os endpoints necessários para que você integre o RoqIA com o n8n ou qualquer outra plataforma utilizando chamadas HTTP padrão. Toda a comunicação deve ser feita em JSON.

## URL Base
O serviço está rodando localmente na porta 3000: `http://localhost:3000`

---

## 1. Agendamentos (Calendário)

### `GET /api/availability`
Verifica a disponibilidade de horários (livres vs ocupados) para uma data específica.

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `userId` | string | Sim | ID do usuário (enviado por Query String) |
| `date` | string | Sim | Data no formato `YYYY-MM-DD` |


### `GET /api/appointments`
Lista todos os agendamentos já criados no sistema para um usuário.

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `userId` | string | Sim | ID do usuário (enviado por Query String) |


### `POST /api/appointments`
Cria um novo agendamento, bloqueando o horário no calendário.

| Parâmetro (Body) | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `userId` | string | Sim | ID do usuário |
| `title` | string | Sim | Título do agendamento (Ex: Corte Degradê) |
| `date` | string | Sim | Data no formato `YYYY-MM-DD` |
| `time` | string | Sim | Horário no formato `HH:MM` |
| `description` | string | Não | Observações e detalhes extras |


### `PUT /api/appointments/:id`
Atualiza os dados de um agendamento já existente.

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | string | Sim | ID do agendamento (via URL / Path) |
| `userId` | string | Sim | ID do usuário (Body) |
| `title` | string | Não | Novo título |
| `date` | string | Não | Nova data |
| `time` | string | Não | Novo horário |
| `description` | string | Não | Nova descrição |


### `DELETE /api/appointments/:id`
Remove permanentemente um agendamento liberando o horário.

| Parâmetro | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | string | Sim | ID do agendamento (via URL / Path) |
| `userId` | string | Sim | ID do usuário (via Query String) |

---

## 2. Financeiro (Dashboard)

### `POST /api/transactions`
Cria uma nova entrada ou saída no painel financeiro. Utilize um nó "HTTP Request" no n8n para chamar este endpoint assim que o atendimento for concluído.

| Parâmetro (Body) | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `userId` | string | Sim | ID do usuário |
| `type` | string | Sim | Use `"income"` para ganhos e `"expense"` para custos |
| `amount` | number | Sim | Valor monetário (Ex: 50.00) |
| `description` | string | Sim | Descrição (Ex: Corte de Cabelo) |
| `date` | string | Sim | Data no formato `YYYY-MM-DD` |

**Exemplo de Corpo (JSON):**
```json
{
  "userId": "ID_DO_USUARIO_AQUI",
  "type": "income",
  "amount": 50.00,
  "description": "Corte de Cabelo (Felipe)",
  "date": "2024-04-17"
}
```
