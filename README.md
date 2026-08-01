# Mapa inicial da Alexandria

Formulário HTML em onze etapas. O site envia as respostas para uma Vercel Function em `api/respostas.js`, e a função grava cada resposta como uma linha em uma base do Notion.

Por padrão, a tela final libera o link do WhatsApp imediatamente (`JOIN_RELEASE_MODE=immediate`). Com a flag em `gated`, o link só sai por e-mail depois que alguém marca **Liberado** no Notion.

## Estrutura

```text
index.html
api/respostas.js
api/notion-webhook.js
assets/
.env.example
```

## 1. Criar a base no Notion

Crie uma nova base de dados em formato de tabela chamada **Respostas Alexandria**.

Configure as colunas com estes nomes e tipos **exatamente**:

| Nome | Tipo no Notion | Origem no formulário |
|---|---|---|
| Participante | Título | Nome extraído de `identidade` |
| Apresentação | Texto | `identidade` (texto livre) |
| E-mail | Email | `email` |
| Telefone | Phone number | `telefone` |
| Modelos | Multi-select | `modelos` |
| Frequência | Select | `frequencia` |
| Temas | Multi-select | `temas` (até 3) |
| Processo | Texto | `processo` (texto livre) |
| Expectativas | Multi-select | `expectativas` (até 3) |
| Participação | Multi-select | `participacao` |
| Ritmo dos encontros | Select | `ritmo_encontros` |
| Disponibilidade | Multi-select | `disponibilidade` |
| Liberado | Checkbox | admin (modo gated) |
| Convite enviado | Checkbox | preenchido pela API após e-mail |
| Enviado em | Hora de criação | automático |

A coluna `Enviado em` é opcional, mas útil. Ela é preenchida automaticamente pelo Notion.

Opções de Select / Multi-select podem ser criadas antes ou na primeira resposta — a API envia o `name` igual ao label do formulário.

## 2. Criar a conexão do Notion

1. Abra o portal de desenvolvedores do Notion.
2. Crie uma **conexão interna** chamada `Alexandria Form`.
3. Habilite pelo menos as capacidades **Ler conteúdo**, **Inserir conteúdo** e **Atualizar conteúdo**.
4. Copie o **Installation access token**. Ele será o valor de `NOTION_TOKEN`.
5. Abra a base **Respostas Alexandria** no Notion.
6. No menu `•••`, escolha **Connections / Conexões** e adicione `Alexandria Form`.

Sem o passo 6, a API normalmente responde com erro 404, mesmo quando o ID está correto.

## 3. Copiar o Data Source ID

Na base do Notion:

1. Abra o menu de configurações da base.
2. Entre em **Manage data sources / Gerenciar fontes de dados**.
3. Use **Copy data source ID**.

Esse valor será `NOTION_DATA_SOURCE_ID`. Não use o ID de uma página comum.

## 4. Configurar na Vercel

No projeto da Vercel, abra:

`Settings → Environment Variables`

Adicione:

```text
NOTION_TOKEN=seu_token_de_integracao
NOTION_DATA_SOURCE_ID=...
JOIN_RELEASE_MODE=immediate
WHATSAPP_INVITE_URL=https://chat.whatsapp.com/...
```

Para o modo gated, adicione também:

```text
JOIN_RELEASE_MODE=gated
RESEND_API_KEY=re_...
EMAIL_FROM=Alexandria <onboarding@seu-dominio.com>
NOTION_WEBHOOK_SECRET=...
```

Marque pelo menos **Production**. Para testar em previews, marque também **Preview**. Depois, faça um novo deploy.

## 5. Liberação do WhatsApp

### Modo `immediate` (padrão)

1. A pessoa envia o formulário.
2. A API responde com `releaseMode: "immediate"` e `whatsappUrl`.
3. A tela final mostra o botão **Entrar no grupo do WhatsApp**.

### Modo `gated`

1. A pessoa envia o formulário (com e-mail e telefone).
2. A tela final **não** mostra o link; avisa que o convite virá por e-mail.
3. No Notion, marque **Liberado**.
4. O webhook em `/api/notion-webhook` lê a página, envia o e-mail via Resend e marca **Convite enviado**.

#### Configurar o webhook do Notion

1. Na conexão Notion, abra a aba **Webhooks**.
2. Crie uma subscription apontando para:

```text
https://SEU-DOMINIO/api/notion-webhook
```

3. Assine eventos de atualização de página/propriedades (ex.: `page.properties_updated` / `page.content_updated`).
4. Na verificação, o endpoint devolve o `verification_token` no JSON da resposta e nos logs. Cole esse token no Notion e guarde o mesmo valor em `NOTION_WEBHOOK_SECRET`.
5. Com `NOTION_WEBHOOK_SECRET` definido, o endpoint valida o header `X-Notion-Signature`.

## 6. Publicar

A pasta deve ser publicada com `index.html` e `api/` na mesma raiz.

Opções:

- subir para um repositório Git e importar na Vercel;
- ou, dentro da pasta, executar `npx vercel`.

Use o preset **Other**. Não é necessário build command nem pacote npm.

## 7. Testar

Após o deploy, abra:

```text
https://SEU-DOMINIO/api/respostas
```

O retorno esperado é:

```json
{
  "ok": true,
  "service": "alexandria-notion",
  "configured": true,
  "releaseMode": "immediate"
}
```

Health do webhook:

```text
https://SEU-DOMINIO/api/notion-webhook
```

Depois preencha o formulário. Uma nova linha deve aparecer na base do Notion. No modo `immediate`, a tela final deve mostrar o CTA do WhatsApp.

## Diagnóstico rápido

- `configured: false`: as variáveis não foram adicionadas ou o deploy não foi refeito.
- erro `401`: token incorreto.
- erro `404`: a base não foi compartilhada com a conexão ou o Data Source ID está errado.
- erro sobre propriedade: algum nome ou tipo de coluna não coincide com a tabela acima.
- CTA sem link no modo immediate: confira `WHATSAPP_INVITE_URL`.
- e-mail gated não chega: confira `JOIN_RELEASE_MODE=gated`, Resend, `EMAIL_FROM`, webhook ativo e checkbox **Liberado**.

## Segurança

O token do Notion, a chave do Resend e o link do WhatsApp ficam somente nas Vercel Functions. O HTML nunca recebe o link no modo `gated`.
