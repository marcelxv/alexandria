# Mapa inicial da Alexandria

Formulário HTML responsivo em seis etapas, com uma pergunta por tela, salvamento automático local e estética alinhada ao site alexandr.ia.

## Abrir localmente

Abra `index.html` no navegador.

## Receber as respostas

No fim do arquivo `index.html`, localize:

```js
const CONFIG = {
  endpoint: "",
  communityName: "Alexandria",
  storageKey: "alexandria-mapa-inicial-v1"
};
```

Preencha `endpoint` com um endereço que aceite `POST` em JSON, como:

- Formspree
- Make
- n8n
- Google Apps Script
- API própria

O corpo enviado tem este formato:

```json
{
  "community": "Alexandria",
  "submittedAt": "2026-08-01T19:00:00.000Z",
  "answers": {
    "identidade": "...",
    "relacao_ia": "...",
    "situacoes": ["..."],
    "destravar": "...",
    "formatos": ["..."],
    "contribuicao": ["..."]
  }
}
```

Sem endpoint, o formulário entra em modo de demonstração e salva os dados somente no navegador do participante.

## Publicação

O diretório pode ser publicado como site estático no Vercel, Netlify, GitHub Pages ou servidor próprio. Mantenha a pasta `assets` ao lado de `index.html`.
