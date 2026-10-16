# Emoncms

[Emoncms](https://emoncms.org/) est le logiciel libre de suivi d'énergie
d'[OpenEnergyMonitor](https://openenergymonitor.org/) : il enregistre les flux
d'un emonPi, d'un emonTx, d'un moniteur de pompe à chaleur emonHP ou de tout
capteur qui lui envoie ses mesures, sur un serveur local ou sur emoncms.org.
Cette intégration amène ces flux dans Gladys : un appareil par étiquette de
flux (en pratique un par nœud : `emonpi`, `emontx4`, `heatpump`…), une
fonctionnalité par flux, avec le bon type Gladys pour son unité. Les flux
d'énergie cumulée (kWh) peuvent servir à l'onglet énergie de Gladys. Une scène
peut réagir quand un flux ne se met plus à jour, envoyer des valeurs de Gladys
vers Emoncms, et un widget du tableau de bord montre les flux encore actifs.

Testée contre un vrai serveur Emoncms 11.9.10 (Docker), avec des entrées
envoyées par son API et transformées en flux de puissance, d'énergie, de
tension, de température et de débit. Développée sans le matériel (pas d'emonPi
ni d'emonTx sous la main) : vos retours sont les bienvenus dans
[les issues](https://github.com/guim31/gladys-emoncms/issues). emoncms.org
utilise la même API mais n'a pas été testé (pas de compte).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur Emoncms joignable depuis la machine de Gladys : un emonPi ou un
  emonBase sur votre réseau, votre propre serveur, ou un compte sur
  emoncms.org.
- La **clé d'API de lecture** du compte Emoncms (page **My Account**
  d'Emoncms). La **clé d'API d'écriture** seulement si vous voulez envoyer des
  valeurs de Gladys vers Emoncms.

L'intégration ne fait que lire, sauf si vous utilisez l'action de scène
« Envoyer une valeur à Emoncms » : elle écrit alors seulement dans les entrées
que vous nommez.

## Pour commencer

### 1. Trouver l'adresse et les clés

Ouvrez Emoncms dans un navigateur et notez l'adresse : `http://192.168.1.20`,
`http://emonpi.local/emoncms` (certains serveurs servent Emoncms sous
`/emoncms`), ou `https://emoncms.org`. Vous pouvez coller l'adresse de
n'importe quelle page d'Emoncms : l'intégration en garde la racine. Ouvrez
ensuite **My Account** : les clés d'API de lecture et d'écriture comptent 32
caractères.

### 2. Configurer l'intégration

Dans Gladys, ouvrez la page de configuration de l'intégration :

- **Adresse d'Emoncms** : l'adresse notée plus haut.
- **Clé d'API de lecture** : suffit pour lire tous les flux.
- **Clé d'API d'écriture (facultative)** : seulement pour l'action de scène
  qui envoie des valeurs.
- **Flux à suivre** : les numéros des flux à amener dans Gladys (colonne Id de
  la page Feeds), séparés par des virgules. Vide : tous les flux.
- **Intervalle de rafraîchissement** : de 5 secondes à 5 minutes, 10 secondes
  par défaut. Chaque rafraîchissement est une seule requête pour tous les flux.
- **Flux arrêté après** : un flux sans nouvelle valeur depuis ce délai est
  considéré comme arrêté (15 minutes par défaut, « Jamais » pour désactiver la
  vérification).
- **Langue des messages** : langue des variables de scène et des erreurs.

Cliquez ensuite sur **Tester la connexion** : l'intégration lit Emoncms et
indique le nombre de flux, d'appareils à ajouter, de flux arrêtés, et si la
clé d'écriture fonctionne.

### 3. Ajouter les appareils

Ouvrez l'onglet **Découverte** de l'intégration : il y a un appareil par
étiquette de flux (les flux sans étiquette sont regroupés dans un appareil
nommé « Emoncms »). Ajoutez ceux que vous voulez. Un nouveau flux, ou un flux
renommé, fait apparaître l'appareil comme modifié : cliquez sur **Mettre à
jour** pour l'ajouter.

## Les appareils

Chaque flux devient une fonctionnalité qui porte le nom du flux, typée selon
son unité :

| Unité Emoncms            | Dans Gladys                                                   |
| ------------------------ | ------------------------------------------------------------- |
| W, kW                    | Puissance (signée : une puissance négative est une injection) |
| kWh, Wh, MWh             | Index d'énergie, utilisé par l'onglet énergie de Gladys       |
| V, A, mA                 | Tension, courant                                              |
| °C, °F, K                | Température                                                   |
| L, m³                    | Volume                                                        |
| L/min, L/h, m³/h         | Débit d'eau, en m³/h (12,5 L/min = 0,75 m³/h)                 |
| hPa, mbar, Pa, kPa, bar  | Pression                                                      |
| lux                      | Luminosité                                                    |
| pulses                   | Compteur                                                      |
| VA, kVA, var, %, ppm, dB | Capteur générique, avec son unité                             |
| aucune, Hz, kWh/d, autre | Capteur générique, l'unité dans son nom                       |

Seuls les flux d'énergie cumulée (kWh, Wh, MWh) deviennent un index d'énergie :
un flux kWh produit par le traitement « Power to kWh » d'Emoncms en est un. Un
flux « kWh/d » reste un capteur générique.

Les valeurs partent vers Gladys quand elles changent. La dernière valeur d'un
flux **arrêté** n'est pas renvoyée comme si elle était fraîche : son historique
dans Gladys s'arrête là où le flux s'est arrêté. Le badge de l'appareil indique
« local » (ou « cloud » pour emoncms.org), et « injoignable » tant qu'Emoncms
ne répond pas.

## Tableau de bord

Le widget **Flux Emoncms** a un réglage, **Appareil (vide : vue d'ensemble)** :

- vide, il montre le nombre de flux à jour et arrêtés, puis une ligne par
  appareil, orange quand l'un de ses flux s'est arrêté ;
- avec un appareil, il montre ses six premiers flux en tuiles en direct, puis
  les flux arrêtés avec le temps écoulé depuis leur dernière valeur.

## Scènes

### Déclencheurs

**Flux Emoncms arrêté ou revenu** : un flux n'a pas reçu de nouvelle valeur
pendant le délai réglé dans **Flux arrêté après**, ou se remet à jour. Filtres :
l'appareil, et le changement (Arrêté, De nouveau à jour). Variables : le flux,
son numéro, l'appareil (étiquette), l'état, les minutes depuis la dernière
valeur et la dernière valeur. Rien ne se déclenche au démarrage de
l'intégration, seulement sur un changement vu pendant qu'elle tourne.

### Actions

**Envoyer une valeur à Emoncms** : envoie un nombre vers une entrée d'Emoncms,
comme le ferait un emonTx, avec la clé d'écriture. Champs : **Nœud** (`gladys`
par défaut), **Nom de l'entrée**, **Valeur**. La valeur peut être une variable
de scène, par exemple une valeur lue juste avant par l'action « Récupérer le
dernier état ». Dans Emoncms, l'entrée apparaît dans la page Inputs :
enregistrez-la dans un flux pour en garder l'historique. Sortie : **Envoyée**.

### Idées de scènes

- **emonTx en panne** : déclencheur « Flux Emoncms arrêté ou revenu »,
  changement « Arrêté », appareil `emontx` → envoyer le message « Emoncms :
  {{feed_name}} arrêté depuis {{minutes}} min ».
- **Garder un capteur Zigbee dans Emoncms** : déclencheur sur la température
  d'un capteur Gladys, action « Récupérer le dernier état », puis
  « Envoyer une valeur à Emoncms » avec le nœud `gladys`, l'entrée `salon` et la
  valeur lue.
- **Puissance de la pompe à chaleur** : une fois le flux de puissance de la
  pompe à chaleur ajouté, une scène peut couper un chauffe-eau quand la
  puissance dépasse un seuil (un déclencheur d'appareil de Gladys, rien de
  propre à l'intégration).

## Dépannage

- **« Emoncms ne répond pas »** : vérifiez l'adresse dans un navigateur depuis
  une machine du même réseau que Gladys. Un emonPi peut être à
  `http://emonpi.local`, mais le conteneur de l'intégration ne résout pas les
  noms en `.local` : préférez l'adresse IP.
- **« Pas d'API Emoncms à cette adresse »** : l'adresse ouvre une autre page
  web. Ajoutez ou retirez le sous-chemin `/emoncms`.
- **« Clé d'API refusée »** : recopiez la clé d'API de lecture depuis My
  Account. Une clé d'écriture lit aussi, mais n'est pas nécessaire.
- **Un flux apparaît arrêté alors qu'il se met à jour** : les horloges de
  Gladys et du serveur Emoncms diffèrent, ou le flux est enregistré moins
  souvent que le délai. Augmentez **Flux arrêté après**.
- **Un nouveau flux manque** : vérifiez **Flux à suivre**, puis **Mettez à
  jour** l'appareil dans l'onglet Découverte.

## Limites

- Un compte Emoncms par installation de l'intégration.
- Les numéros et étiquettes des flux identifient les fonctionnalités : un flux
  déplacé vers une autre étiquette devient une nouvelle fonctionnalité d'un
  autre appareil, sans l'ancien historique.
- Les entrées d'Emoncms ne sont pas lues : seulement les flux. L'historique déjà
  présent dans Emoncms n'est pas importé dans Gladys.
- Gladys ne peut pas envoyer automatiquement les états de ses appareils à
  Emoncms : une scène avec l'action « Envoyer une valeur à Emoncms » le fait,
  une valeur à la fois.
- emoncms.org : même API, non testé ; respectez ses règles d'usage (un
  rafraîchissement toutes les 10 secondes ou plus lent suffit largement).
