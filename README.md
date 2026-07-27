# Transfert P2P Ultra-Rapide (Grands Fichiers WebRTC)

Application Web **Peer-to-Peer (P2P)** haute performance pour le transfert sécurisé et direct de très grands fichiers (plusieurs gigaoctets à 50 Go+) entre deux navigateurs Web, **sans jamais transiter par un serveur de stockage cloud**.

Toute l'interface utilisateur, les messages d'erreur, les notifications et le guide d'utilisation sont intégralement rédigés en **français**.

---

## 🚀 Fonctionnalités Clés

* **0 % Cloud & Confidentialité Totale** : Le serveur de signalement n'a jamais accès aux fichiers transférés. Les données circulent exclusivement en liaison directe de navigateur à navigateur via WebRTC DataChannel.
* **Chiffrement de Bout en Bout (E2EE)** : Toutes les transmissions WebRTC sont chiffrées de façon native avec le protocole **DTLS**.
* **Intégrité Garantie par SHA-256** : Empreinte numérique SHA-256 calculée en flux (streaming) avant l'envoi et vérifiée à la réception pour chaque fichier.
* **Écriture Directe sur Disque (Streaming Low-RAM)** : Évite le chargement complet des fichiers en mémoire vive grâce à l'API **File System Access** (`showSaveFilePicker`). Permet de transférer sereinement des fichiers de plus de **50 Go**.
* **Support Multi-Fichiers et Dossiers Entiers** : Glissez-déposez des dossiers complets avec conservation de l'arborescence (`webkitGetAsEntry`).
* **Gestion du Backpressure et Contrôle de Flux** : Utilisation du seuil `bufferedAmountLowThreshold` WebRTC pour éviter la saturation réseau ou la perte de paquets.
* **Ordonnancement et Sélection Personnalisée** : Le destinataire choisit précisément les fichiers à télécharger et réorganise la priorité par glisser-déposer ou flèches.
* **Bouton d'Action Dédié** : Validation par le bouton *"Démarrer le téléchargement sélectionné"*.
* **PWA Installable (Progressive Web App)** : Support de l'installation sur le bureau ou mobile avec *manifest.json* et *Service Worker* pour utilisation hors-ligne.

---

## 🛠️ Prérequis

* **Node.js** v18.0.0 ou version supérieure
* **npm** v9.0.0 ou version supérieure
* Navigateurs supportés : Chrome, Edge, Firefox, Brave, Safari (avec support WebRTC).

---

## 📦 Installation et Démarrage Rapide

### 1. Cloner et installer les dépendances

```bash
git clone https://github.com/votre-compte/transfert-p2p.git
cd transfert-p2p
npm install
```

### 2. Lancer le serveur de signalement et l'application en développement

```bash
npm run dev
```

L'application sera accessible à l'adresse [http://localhost:3000](http://localhost:3000).

---

## 🏭 Déploiement en Production

### 1. Génération du build de production

```bash
npm run build
```

Cette commande exécute `vite build` pour le frontend et rassemble le serveur Node.js backend dans `dist/server.cjs`.

### 2. Démarrage du serveur en mode production

```bash
npm start
```

---

## 📊 Architecture Technique

```
┌───────────────────────────┐                        ┌───────────────────────────┐
│   Navigateur Expéditeur   │                        │   Navigateur Destinataire │
│                           │                        │                           │
│  - Hachage SHA-256 Flux   │                        │  - Écriture Disque Direct │
│  - Découpage par morceaux │                        │  - Vérification SHA-256   │
└─────────────┬─────────────┘                        └─────────────▲─────────────┘
              │                                                    │
              │         Canal WebRTC DataChannel (Chiffré E2EE)    │
              └────────────────────────────────────────────────────┘
                                         ▲
                                         │
                         Signalement SDP / Candidats ICE
                                         │
                         ┌───────────────┴───────────────┐
                         │ Serveur Express + Socket.IO   │
                         │   (Signalement Uniquement)    │
                         └───────────────────────────────┘
```

---

## 📜 Licence

Ce projet est sous licence Apache-2.0.
