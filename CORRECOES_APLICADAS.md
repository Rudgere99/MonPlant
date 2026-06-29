# Correções aplicadas no MonPlant

## 1. Build / dependências
- `package-lock.json` atualizado com `npm install`.
- Validado com `npm ci`.
- Validado com `npm run build`.

## 2. Arquivos de ambiente
- Corrigido `frontend/.env.example` para conter somente `VITE_API_BASE`.
- Corrigido `backend/.env.example` com variáveis reais de ambiente: `DATABASE_URL`, `AUTH_SECRET`, `DEV_KEY`, `CORS_ORIGINS`, `RETRO_ALLOW_UNTIL_HOUR` e `AUTH_TTL_HOURS`.

## 3. PWA
- Corrigido ícone `icon-512.png.png` para `icon-512.png`, compatível com `manifest.webmanifest`.

## 4. Trava de data
- Regra ajustada no backend:
  - data futura bloqueada;
  - data atual liberada;
  - dia anterior liberado somente até `RETRO_ALLOW_UNTIL_HOUR`, padrão `01:00`;
  - DEV ou usuário com `can_edit_retroactive` continuam com bypass.
- A trava foi aplicada também em horímetros e `stops-launch`.

## 5. Segurança das rotas de escrita
- Criadas dependências de autenticação/autorização:
  - `require_authenticated_user`;
  - `require_write_user`;
  - `require_control_user`.
- Rotas `POST`, `PUT`, `PATCH` e `DELETE` de dados operacionais/configurações agora exigem token e role compatível.

## 6. Dashboard
- Corrigida a expansão de faixas de parada:
  - `19-21` agora gera `19-20` e `20-21`;
  - não gera mais indevidamente `21-22`.

## 7. Equipamentos por planta no lançamento de paradas
- A tela `LancamentoParadas.tsx` agora lista somente TAGs cadastradas na planta selecionada.
- Removeu a mistura automática de escavadeiras globais na seleção da parada.

## 8. Mobile
- Rotas mobile sensíveis (`/m/supervisores-planta`, `/m/dev/logs`, `/m/dev/users`) agora também passam por validação de role.

## 9. CSS
- Corrigido bloco `.mp-logout` em `index.css`, removendo o aviso de CSS com chave desbalanceada no build.

## 10. Banco de dados
- Adicionado `backend/migrations/001_initial_schema.sql` com schema inicial mínimo para banco novo.

## Validações executadas

```bash
python -m py_compile backend/main.py backend/db.py backend/auth_dep.py
cd frontend && npm ci --no-audit --no-fund
cd frontend && npm run build
```

Resultado: backend compila e frontend gera build de produção.
