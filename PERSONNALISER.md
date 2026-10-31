# PERSONNALISER — tout ce que tu peux (et dois) modifier

Ce guide liste **chaque endroit** à adapter, avec le fichier, le repère à chercher (Ctrl+F) et le numéro de ligne de la version livrée.
Si tu as déjà modifié un fichier, fie-toi au **repère** plutôt qu'au numéro de ligne. Dans les fichiers, cherche **★** (à personnaliser) et **📁** (fichier à déposer).

Code : 🔴 **obligatoire** · 🟡 **recommandé** · ⚪ **facultatif** (goût personnel)

---

## 1 · Les fichiers à déposer

| | Dossier | Quoi | Formats / conseils | Où l'indiquer |
|---|---|---|---|---|
| 🔴 | `assets/portrait/` | **UNE** photo d'elle (le nom n'a pas d'importance) | jpg, png, webp, avif · **visage bien visible et éclairé**, lunettes et mains acceptées, fond chargé accepté (la silhouette est détourée) · ≥ 800 px de haut · 30 Mo max | nulle part : détectée automatiquement |
| 🔴 | `assets/photos/` | Photos des étoiles **II** et **III** | jpg, webp, png · grand côté 1600–2200 px · moins de 2 Mo chacune | `data.php` l. 83 (`photo1.jpg`) et l. 94 (`photo2.jpg`) |
| 🟡 | `assets/photos/` | Photos supplémentaires (jusqu'à ~8 par galerie) | idem | remplacer `'media'` par `'gallery' => [[…], […]]` (exemple en commentaire sous l'étoile II) |
| 🔴 | `assets/videos/` | Vidéo de l'étoile **VI** | **mp4 H.264 + AAC** · 720p ou 1080p · moins de 40 Mo | `data.php` l. 122 (`video1.mp4`) |
| 🟡 | `assets/audio/` | Tes chansons — **autant que tu veux**, jouées l'une après l'autre | mp3 (conseillé), m4a, ogg, wav · 128–192 kb/s · 2 à 5 Mo chacune · **ordre alphabétique** : nomme-les `01-…`, `02-…` | `data.php` l. 172 ★6 `$music` (liste ordonnée possible) |
| ⛔ | `assets/vendor/` | **Ne pas toucher** : reconnaissance du visage + détourage de la silhouette (≈ 17 Mo) | fournis, à garder avec le projet | — |

**Le nom du fichier déposé doit être identique au nom écrit dans `data.php`** (majuscules comprises). Si un fichier manque, rien ne casse.
Vérification du portrait : `portrait.php?info`. Le visage est reconnu **dans le navigateur** : la photo n'est envoyée à aucun service.

---

## 2 · `data.php` — ton histoire (🔴 le seul fichier obligatoire)

### ★1 Identité et comportement
| | Repère | Ligne | À quoi ça sert |
|---|---|---|---|
| 🔴 | `'recipient'` | l. 20 | son prénom : grand titre de la porte d'entrée |
| 🟡 | `'title'` | l. 21 | titre de la page et bandeau en haut à gauche |
| 🟡 | `'subtitle'` | l. 22 | petite phrase au-dessus de son prénom |
| 🟡 | `'tagline'` | l. 23 | phrase sous son prénom |
| 🟡 | `'always_fresh'` | l. 26 | `true` : **chaque ouverture ou actualisation rejoue toute l'expérience comme la première fois** (introduction complète, étoiles éteintes) · `false` : le navigateur retient sa progression |

### ★2 Portrait
| | Repère | Ligne | À quoi ça sert |
|---|---|---|---|
| ⚪ | `'enabled'` | l. 35 | `false` = pas de portrait |
| 🟡 | `'caption'`, `'subtitle'` | l. 36, l. 37 | texte sous le portrait |
| ⚪ | `'stars'` | l. 38 | densité : 24000 par défaut ; 32000 = plus fin mais plus lourd (réduite sur mobile) |
| ⚪ | `'hair'` | l. 40 | `'auto'`, `'dark'` ou `'light'` — seulement si la silhouette n'a pas pu être détourée |
| ⚪ | `'invert'`, `'focus'` | l. 41, l. 42 | seulement si aucun visage n'est reconnu (analyse de secours) |

### ★3 Les 8 étoiles (titre · texte · média)
Le chiffre romain d'une étoile = son **rang dans la liste** de `data.php`.

| | Étoile | Monde | Titre | Texte | Média |
|---|---|---|---|---|---|
| 🔴 | **I** (`bottom-tip`) | planète-souvenir | l. 70 | l. 73 | — |
| 🔴 | **II** (`right-upper`) | galerie | l. 81 | l. 82 | l. 83 |
| 🔴 | **III** (`left-upper`) | galerie | l. 92 | l. 93 | l. 94 |
| 🔴 | **IV** (`right-mid`) | constellation vivante | l. 101 | l. 103 | — |
| 🔴 | **V** (`left-mid`) | constellation vivante | l. 111 | l. 112 | — |
| 🔴 | **VI** (`right-lower`) | cinéma | l. 120 | l. 121 | l. 122 |
| 🔴 | **VII** (`left-lower`) | arbre de lumière | l. 129 | l. 131 | — |
| 🔴 | **VIII** (`top-dip`) | tunnel d'étoiles | l. 139 | l. 141 | — |

Chaque phrase du `'text'` (ou chaque élément de `'items'`) devient un élément à explorer :

| Monde | 1 phrase devient… | Maximum |
|---|---|---|
| planète-souvenir | une lune en orbite | 10 |
| galerie | une carte de texte à côté des photos | 10 |
| cinéma | une phrase qui défile sur l'écran (si la vidéo manque) | 10 |
| constellation vivante | une étoile à allumer | 9 |
| arbre de lumière | une lumière de l'arbre | 9 |
| tunnel d'étoiles | une porte avec un souhait | 8 |

Remplace **tout** le texte entre crochets `[...]`. Facultatif par étoile : `'accent'` (couleur du monde), `'kicker'`, `'world'` (forcer un autre monde), `'items'`.

### ★4 La lettre
| | Repère | Ligne | À quoi ça sert |
|---|---|---|---|
| 🟡 | `$letterTitle` | l. 150 | titre de la lettre |
| 🔴 | `$letterParagraphs` | l. 151 | un paragraphe = un écran (ajoutes-en ou retires-en librement) |
| 🔴 | `$letterSignoff` | l. 157 | signature, affichée en doré à la fin |

### ★6 Musique
| | Repère | Ligne | À quoi ça sert |
|---|---|---|---|
| 🟡 | `'tracks'` | l. 175 | `'auto'` = toutes les chansons de `assets/audio/` par ordre alphabétique · ou `['a.mp3', 'b.mp3']` pour choisir l'ordre |
| 🟡 | `'loop'` | l. 176 | `true` : après la dernière on recommence à la première · `false` : silence à la fin |
| ⚪ | `'shuffle'`, `'volume'` | l. 177, l. 178 | ordre aléatoire · volume de 0 à 1 |

### ★5 Phrases d'ouverture
| | Repère | Ligne | À quoi ça sert |
|---|---|---|---|
| 🟡 | `$introLines` | l. 162 | les 2 phrases du film d'introduction |

---

## 3 · Textes de l'interface écrits en dur (⚪ facultatif)

| Fichier | Repère (Ctrl+F) | Ligne | Contenu |
|---|---|---|---|
| `index.php` | `id="g-load"` | l. 136 | porte d'entrée : « Entrer dans la galaxie », « Une expérience à vivre avec le son… », « fait avec amour » |
| `index.php` | `id="intro-skip"` | l. 126 | « Passer l'introduction » |
| `index.php` | `id="hud-progress"` | l. 161 | « étoiles allumées » |
| `index.php` | `id="world-hud"` | l. 170 | « Retour au cœur » |
| `js/app.js` | `'Allumer la nébuleuse'` | l. 3 | messages du chargement |
| `js/app.js` | `Choisis une étoile` | l. 4 | indices en bas de l'écran |
| `js/app.js` | `Lire quand même` | l. 4 | message quand elle touche le cœur trop tôt |
| `js/worlds.js` | `meta.hint` | 225, 281, 389, 463, 546, 604, 678 | une phrase d'aide par monde |
| `js/hub.js` | `Constellation de` | l. 8 | libellé « Constellation de … » |
| `js/hub.js` | `const CONSTS` | l. 333 | noms et sous-titres des constellations du ciel |

---

## 4 · Couleurs, ambiance, rythme (⚪ facultatif)

| Fichier | Repère | Ligne | Effet |
|---|---|---|---|
| `style.css` | `:root` — `--gold`, `--rose` | l. 5–9 | couleurs de toute l'interface |
| `style.css` | `--font-display`… | l. 11 | polices (change aussi le lien Google Fonts de `index.php` l. 106) |
| `index.php` | `theme-color` | l. 100 | couleur de la barre du navigateur sur mobile |
| `js/hub.js` | `vec3 ramp` | l. 229 | **couleurs de la nébuleuse du cœur** |
| `js/hub.js` | `const ACCENTS` | l. 4 | couleur des balises des étoiles |
| `js/hub.js` | `const BEAT` | l. 659 | rythme du battement de cœur (secondes) |
| `js/app.js` | `const HUB_ZOOM` | l. 35 | recul de la caméra dans le cœur |
| `js/app.js` | `first ? 6400 : 2600` | l. 6 | durée d'affichage du portrait (ms) |
| `js/worlds.js` | `const PAL` | l. 24 | les 3 couleurs de chaque monde |
| `js/worlds.js` | `makeDome(this,` | Planet 202, Gallery 275, Cinema 363, Constellation 440, Tree 508, Tunnel 573, Letter 663 | **couleurs du ciel** de chaque monde |
| `js/engine.js` | `const MOODS` | l. 253 | ambiance sonore générée de chaque lieu |

---

## 5 · Checklist finale

- [ ] 🔴 `assets/portrait/` : sa photo déposée → `portrait.php?info` indique « OK »
- [ ] 🔴 `data.php` ★1 : prénom, titre, phrases (et `always_fresh` si tu veux garder la progression)
- [ ] 🔴 `data.php` ★3 : les 8 étoiles — titres et textes remplacés (plus aucun `[crochet]`)
- [ ] 🔴 `assets/photos/` et `assets/videos/` : fichiers déposés, noms identiques à `data.php`
- [ ] 🔴 `data.php` ★4 : lettre et signature
- [ ] 🟡 `assets/audio/` : tes chansons (nommées `01-…`, `02-…` pour maîtriser l'ordre) · ★2 et ★5 : légende, phrases d'ouverture
- [ ] ⚪ couleurs / textes d'interface (sections 3 et 4)
- [ ] Test : `php -S localhost:8000`, **Ctrl+F5**, parcourir les 8 étoiles, ouvrir la lettre, tester sur téléphone