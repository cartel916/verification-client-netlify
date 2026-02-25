# Verification client Netlify (1 page + notification Telegram)

## Fichiers
- `index.html` : page unique avec formulaire + demande de géolocalisation
- `netlify/functions/notify-location.js` : backend Netlify Function qui envoie une notification Telegram
- `netlify.toml` : configuration Netlify (publish + functions)

## Variables d'environnement Netlify (obligatoires)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Déploiement (rapide)
1. Importe ce dossier dans un repo GitHub
2. Netlify > Add new project > Import an existing project > GitHub
3. Choisis le repo
4. Laisse build command vide
5. Déploie
6. Ajoute les variables d'environnement
7. Trigger deploy

## Important
- La position GPS nécessite l'autorisation explicite de l'utilisateur
- La précision dépend de l'appareil/signal (`accuracy_m`)
