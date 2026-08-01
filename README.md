# Mapa inicial da Alexandria

Formulário HTML em nove etapas. O site envia as respostas para uma Vercel Function em `api/respostas.js`, e a função grava cada resposta como uma linha em uma base do Notion.

## Estrutura

```text
index.html
api/respostas.js
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
| Modelos | Multi-select | `modelos` |
| Frequência | Select | `frequencia` |
| Temas | Multi-select | `temas` (até 3) |
| Processo | Texto | `processo` (texto livre) |
| Expectativas | Multi-select | `expectativas` (até 3) |
| Participação | Multi-select | `participacao` |
| Ritmo dos encontros | Select | `ritmo_encontros` |
| Disponibilidade | Multi-select | `disponibilidade` |
| Enviado em | Hora de criação | automático |

A coluna `Enviado em` é opcional, mas útil. Ela é preenchida automaticamente pelo Notion.

Opções de Select / Multi-select podem ser criadas antes ou na primeira resposta — a API envia o `name` igual ao label do formulário.

## 2. Criar a conexão do Notion

1. Abra o portal de desenvolvedores do Notion.
2. Crie uma **conexão interna** chamada `Alexandria Form`.
3. Habilite pelo menos as capacidades **Ler conteúdo** e **Inserir conteúdo**.
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
```

Marque pelo menos **Production**. Para testar em previews, marque também **Preview**. Depois, faça um novo deploy.

## 5. Publicar

A pasta deve ser publicada com `index.html` e `api/` na mesma raiz.

Opções:

- subir para um repositório Git e importar na Vercel;
- ou, dentro da pasta, executar `npx vercel`.

Use o preset **Other**. Não é necessário build command nem pacote npm.

## 6. Testar

Após o deploy, abra:

```text
https://SEU-DOMINIO/api/respostas
```

O retorno esperado é:

```json
{
  "ok": true,
  "service": "alexandria-notion",
  "configured": true
}
```

Depois preencha o formulário. Uma nova linha deve aparecer na base do Notion.

## Diagnóstico rápido

- `configured: false`: as variáveis não foram adicionadas ou o deploy não foi refeito.
- erro `401`: token incorreto.
- erro `404`: a base não foi compartilhada com a conexão ou o Data Source ID está errado.
- erro sobre propriedade: algum nome ou tipo de coluna não coincide com a tabela acima.

## Segurança

O token do Notion fica somente na Vercel Function. Ele nunca é enviado ao navegador nem incluído no HTML.
