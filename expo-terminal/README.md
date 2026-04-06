# Expo Terminal (React Native)

App Expo para abrir o Terminal web em um WebView, passando `device_id` pela URL para permitir reconhecimento do dispositivo.

## Rodar localmente

```bash
cd expo-terminal
npm install
npx expo start
```

- Android: `a` no terminal do Expo (precisa emulador) ou Expo Go no dispositivo.
- iOS: `i` no terminal do Expo (precisa Mac + simulador).

## Configurar

No app:
- Abra **Config**
- Defina a **URL base** (ex: `http://192.168.1.14:8080`)
- Opcional: defina `device_id`

O app abre:
`{BASE_URL}/terminal?device_id={DEVICE_ID}`

## Build com EAS

```bash
npm install -g eas-cli
cd expo-terminal
eas login
eas build:configure
eas build --platform android
```

