# Notre petite galaxie — guide complet

Une expérience 3D en plein écran, écrite pour une seule personne :

1. **Ouverture cinématique** — des étoiles dispersées se rassemblent pour dessiner **son portrait**
   (généré automatiquement depuis une photo), relié par des lignes de constellation, puis se
   transforment en un **cœur-nébuleuse vivant**.
2. **Le cœur** — un ciel en 3D qu'on fait tourner à la main, avec de vraies constellations,
   et **8 étoiles** (balises numérotées).
3. **Un monde par étoile** — chaque étoile ouvre son propre monde à explorer (planète, galerie,
   cinéma, constellation, arbre de lumière, tunnel d'étoiles).
4. **La lettre** — dans un cœur 3D qui bat, quand toutes les étoiles sont allumées.

PHP + JavaScript + Three.js (WebGL). Aucune installation, aucun build.

---

## 1. Structure

```
index.php        page + normalisation du contenu (ne contient aucun texte à modifier)
data.php         ★ LE SEUL FICHIER À MODIFIER : identité, portrait, étoiles, lettre
portrait.php     sert la photo du portrait, nettoyée (redressée, sans GPS/EXIF, réduite, en cache)
style.css        interface (porte d'entrée, HUD, lecteur, mobile…)
js/engine.js     fondations : rendu, horloge, entrées souris/tactile, caméra, audio génératif
js/portrait.js   photo → portrait d'étoiles (reconnaissance du visage + analyse d'image)
js/hub.js        le ciel : cœur, portrait, constellations, balises
js/worlds.js     les 7 mondes (6 étoiles-types + la lettre)
js/app.js        chef d'orchestre : porte d'entrée, ouverture, voyages, HUD
assets/          portrait/  photos/  videos/  audio/   (voir les LISEZ-MOI.txt)
assets/vendor/   face_mesh/ + selfie_segmentation/ = reconnaissance du visage et détourage MediaPipe (≈ 17 Mo, à garder tel quel)
```

> **À supprimer si tu viens de l'ancienne version :** l'ancien `main.js` à la racine n'est plus utilisé.

## 2. Tester en local

```
php -S localhost:8000      # depuis le dossier du projet
```
Ouvre `http://localhost:8000`. Sur téléphone : même Wi-Fi, `http://<IP-de-ton-ordinateur>:8000`.
Il faut une connexion Internet (Three.js et les polices viennent d'un CDN).

## 3. Le portrait d'étoiles

1. Dépose **une** photo dans `assets/portrait/` (jpg, png, webp ou avif). Le nom n'a pas d'importance.
2. Recharge la page. C'est tout.

**Ce que fait le système :** tout se passe **dans le navigateur** (la photo n'est envoyée à aucun service).
1. Il **détoure ta silhouette entière** (cheveux, main, cou, épaules, vêtements) et **reconnaît le visage**.
2. Il pose des étoiles-repères exactement sur les sourcils, les yeux, les iris, les lèvres et le nez, et les relie en constellations.
3. Il dessine **tout le portrait** avec ~24 000 étoiles, plus nombreuses dans la lumière, **colorées avec les vraies couleurs de la photo**
   (peau, cheveux, lèvres, vêtements). Les mèches, les lunettes et les bijoux sont reliés par des lignes qui suivent leurs contours.
Si la silhouette n'a pas pu être détourée, le système estime la tête, les cheveux et les épaules autour du visage ; si aucun visage
n'est reconnu, une analyse de secours prend le relais (moins précise).

**Pour un beau résultat :** visage bien visible et bien éclairé (de face, trois-quarts ou penché : les lunettes et une main
sur le front sont acceptées), au moins 800 px de haut. Le fond peut être chargé : la silhouette est détourée automatiquement. Aucune retouche nécessaire.

**Réglages** (dans `data.php`, section `$portrait`) :

| Clé | Rôle |
|---|---|
| `enabled` | `false` pour désactiver le portrait |
| `stars` | densité (24000 par défaut ; 32000 = plus fin mais plus lourd ; réduite sur mobile) |
| `hair` | `'auto'`, `'dark'` ou `'light'` — utilisé seulement si la silhouette n'a pas pu être détourée |
| `mode` | `auto` (conseillé), `tone` (lumière seule), `edges` (traits seuls) |
| `invert`, `focus` | utilisés seulement par l'analyse de secours |
| `caption`, `subtitle` | texte affiché sous le portrait |

**Diagnostic :** ouvre `portrait.php?info`. La console du navigateur (F12) affiche `[portrait]` avec la voie utilisée :
`route: "face"` = visage reconnu ; `route: "classic"` = analyse de secours.

**Confidentialité :** la photo originale n'est jamais servie ; `portrait.php` envoie une copie réduite, sans métadonnées (GPS,
appareil…). Le fichier `assets/portrait/.htaccess` bloque l'accès direct à l'original **sur Apache**. Sur **nginx**, ajoute :
`location /assets/portrait/ { deny all; }`. Sans l'extension GD de PHP, la photo est servie telle quelle (rien ne casse).

**Reconnaissance du visage et détourage :** les fichiers sont dans `assets/vendor/face_mesh/` et `assets/vendor/selfie_segmentation/`
(≈ 17 Mo en tout, chargés une seule fois puis mis en cache ; navigateurs récents). Sur un navigateur très ancien, le système utilise le CDN jsDelivr. Si ton hébergeur sert mal les fichiers `.wasm`, le `.htaccess` fourni règle le type MIME ; en dernier recours, le
système essaie le CDN jsDelivr, puis l'analyse de secours.

## 4. Écrire le contenu (`data.php`)

Chaque étoile a un `type` qui choisit son monde :

| type | monde | ce que la personne fait |
|---|---|---|
| `memory` | planète-souvenir | lunes en orbite : chacune porte un fragment à lire |
| `photo` | galerie flottante | photos et mots autour d'elle, sous des aurores |
| `video` | cinéma céleste | écran géant ; sans vidéo, les phrases défilent dessus |
| `trait` | constellation vivante | une étoile par qualité, qu'on allume une à une |
| `lesson` | arbre de lumière | l'arbre pousse ; chaque lumière est une leçon |
| `future` | tunnel d'étoiles | on voyage de porte en porte, chacune garde un souhait |

Champs d'une étoile : `position`, `type`, `title`, `text` (obligatoires) ; `items` (liste de phrases
affichées une à une — sinon `text` est découpé en phrases automatiquement) ; `media` (une photo ou une vidéo) ;
`gallery` (plusieurs photos avec légendes) ; `accent` (couleur du monde, ex. `#F3A8C7`) ; `kicker` ;
`world` pour forcer un autre monde. Positions possibles (une seule fois chacune) :
`bottom-tip`, `right-lower`, `right-mid`, `right-upper`, `top-dip`, `left-upper`, `left-mid`, `left-lower`.

La **lettre** : `$letterTitle`, `$letterParagraphs`, `$letterSignoff`. Elle s'ouvre en touchant le cœur lumineux ;
avant que toutes les étoiles soient allumées, un message propose de patienter ou de lire quand même.

## 4b. Toujours comme la première fois

Par défaut (`'always_fresh' => true` dans `data.php`), **chaque ouverture ou actualisation** de la page rejoue toute
l'expérience comme la toute première fois : introduction complète, portrait, étoiles de nouveau éteintes. Rien n'est mémorisé
entre deux visites (sauf le choix « son coupé »). Mets `false` si tu préfères que le navigateur retienne la progression
(introduction raccourcie, étoiles déjà allumées).

## 4c. Musique : plusieurs chansons, l'une après l'autre

Dépose tes chansons (mp3 conseillé ; m4a, ogg, wav acceptés) dans `assets/audio/` — autant que tu veux. Quand la première se termine
(avec un petit fondu), **la suivante démarre toute seule** ; après la dernière, on recommence à la première. La musique démarre à
l'entrée dans la galaxie (jamais avant un geste de la personne) ; le bouton « son » la coupe et la reprend à la même seconde, et son
infobulle indique la chanson en cours. Les réglages sont dans `data.php`, section ★6 (`$music`) :

| Clé | Rôle |
|---|---|
| `tracks` | `'auto'` = toutes les chansons du dossier, dans l'**ordre alphabétique** (astuce : nomme-les `01-…`, `02-…`) ; ou une liste choisie : `['premiere.mp3', 'deuxieme.mp3']` |
| `loop` | `true` = on recommence après la dernière · `false` = silence à la fin |
| `shuffle` | `true` = ordre aléatoire |
| `volume` | volume de la musique, de 0 à 1 (0.55 par défaut) |

Un fichier illisible est simplement sauté. Les noms avec espaces ou accents sont acceptés. Pendant une vidéo, la musique baisse toute seule.

## 5. Commandes

| | ordinateur | téléphone |
|---|---|---|
| tourner le ciel / regarder autour | glisser | glisser |
| zoomer | molette | pincer |
| ouvrir une étoile | clic | toucher |
| revenir au cœur | bouton « Retour » ou `Échap` | bouton « Retour » |
| passer l'ouverture | bouton ou `Échap` / `Espace` | bouton |
| tunnel | molette, ↑ ↓, ou « Voyage automatique » | glisser vers le haut |
| lettre | clic, → ou `Espace` | toucher |

Boutons en haut à droite : portrait, constellations, son, plein écran, aide. Le compteur en bas à gauche
montre les étoiles allumées (cliquer un point y emmène directement).

## 6. Performance

La résolution s'ajuste toute seule si l'image saccade. Moins d'étoiles sur petit écran. Si le système demande
« réduire les animations », le mouvement est ralenti. Le son est généré par le navigateur (aucun fichier requis) ;
La musique est facultative (voir la section 4c). Les vidéos : mp4 H.264, de préférence < 40 Mo.

## 7. Dépannage

| Symptôme | Piste |
|---|---|
| Page noire / message WebGL | navigateur ou appareil sans WebGL : en essayer un autre |
| Pas de portrait | ouvrir `portrait.php?info` ; vérifier qu'il y a une seule photo valide dans `assets/portrait/` |
| Portrait en « nuage » sans traits | le visage n'a pas été reconnu : console (F12) → `[portrait]` ; essaie une photo plus nette, plus grande, mieux éclairée |
| Contour de la tête étrange (cheveux) | `'hair' => 'dark'` ou `'light'` dans `data.php` |
| Chargement long au début | la reconnaissance du visage et le détourage (≈ 17 Mo) se téléchargent une fois ; ensuite ils sont en cache |
| Un « trou » ou des étoiles qui s'écartent sur le portrait | c'est le sillage de la souris : il s'active quand tu bouges la souris sur le portrait, et reste léger |
| Portrait mal cadré / peu lisible | essayer `focus`, `invert` ou `mode` ; une photo plus contrastée et au fond plus simple aide |
| Photo ou vidéo non affichée | vérifier le chemin dans `data.php` (le monde affiche un cadre « à ajouter » sinon) |
| Pas de son | le navigateur n'autorise le son qu'après un clic : le bouton « Entrer » le déclenche ; vérifier le bouton son et qu'il y a des fichiers dans `assets/audio/` |
| La 2e chanson ne démarre pas | vérifier qu'elle est bien dans `assets/audio/` (ou nommée dans `tracks`) et lisible ; l'ordre est alphabétique |
| Modifications invisibles | rechargement forcé (`Ctrl+F5`) |

## 8. Mise en ligne

Un hébergement PHP classique suffit (la plupart des mutualisés conviennent). Choisis une adresse difficile à
deviner (la page est marquée `noindex`). Garde les fichiers et le dossier `assets/` ensemble.