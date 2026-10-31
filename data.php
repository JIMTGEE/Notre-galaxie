<?php
declare(strict_types=1);

/* ╔══════════════════════════════════════════════════════════════════════════╗
   ║  data.php — LE SEUL FICHIER OBLIGATOIRE À MODIFIER                       ║
   ║                                                                          ║
   ║  ★  = une valeur à personnaliser (cherche « ★ » dans ce fichier)         ║
   ║  📁 = un fichier à déposer dans le dossier indiqué                        ║
   ║                                                                          ║
   ║  Ordre conseillé :  ★1 identité  →  ★2 portrait  →  ★3 les 8 étoiles     ║
   ║                     →  ★4 la lettre  →  ★5 phrases d'ouverture           ║
   ║  La liste complète (y compris les réglages facultatifs des autres        ║
   ║  fichiers) est dans  PERSONNALISER.md                                    ║
   ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ══════════════════════════════════════════════════════════════════════════
   ★1 · IDENTITÉ — porte d'entrée, titre de la page, constellation, lettre
   ══════════════════════════════════════════════════════════════════════════ */
$site = [
    'recipient' => 'Sana',                                                   // ★ son prénom (grand titre de la porte d'entrée)
    'title'     => 'Notre petite galaxie',                                     // ★ titre de la page et du bandeau en haut à gauche
    'subtitle'  => 'Une histoire écrite dans les étoiles',                     // ★ petite phrase au-dessus de son prénom
    'tagline'   => "une galaxie n'attend que toi — chaque étoile garde un morceau de nous.", // ★ phrase sous son prénom
    // ★ true = chaque ouverture ou actualisation de la page rejoue TOUTE l'expérience comme la toute première fois
    //   (introduction complète, étoiles à nouveau éteintes). false = le navigateur retient sa progression.
    'always_fresh' => true,
];

/* ══════════════════════════════════════════════════════════════════════════
   ★2 · PORTRAIT D'ÉTOILES — généré automatiquement depuis une photo
   📁 Dépose UNE photo (jpg, png, webp, avif) dans :  assets/portrait/
      (le nom du fichier n'a aucune importance). Pas de photo = pas de portrait.
   ══════════════════════════════════════════════════════════════════════════ */
$portrait = [
    'enabled'  => true,                       // ★ false pour désactiver complètement le portrait
    'caption'  => 'Sana',                   // ★ texte affiché sous le portrait
    'subtitle' => 'Mon étoile de Princesse',   // ★ petite ligne sous le texte ci-dessus
    'stars'    => 24000,                      //   densité (plus = plus détaillé ; réduite tout seul sur mobile)
    'mode'     => 'auto',                     //   'auto' (conseillé) | 'tone' (lumière seule) | 'edges' (traits seuls)
    'hair'     => 'auto',                     //   cheveux : 'auto' | 'dark' (sombres, cas courant) | 'light' (clairs) — si le contour de la tête est mal dessiné
    'invert'   => false,                      // ★ (analyse sans visage reconnu) true si la personne est SOMBRE sur un fond CLAIR
    'focus'    => null,                       // ★ [0.5, 0.45] = centre du visage (0 à 1) si le cadrage automatique se trompe
];

/* ══════════════════════════════════════════════════════════════════════════
   ★3 · LES 8 ÉTOILES DU CŒUR
   Chaque étoile ouvre son propre monde, choisi par son 'type' :
     memory → planète et lunes-souvenirs      photo  → galerie flottante sous des aurores
     video  → cinéma céleste                  trait  → constellation qu'on allume étoile par étoile
     lesson → arbre de lumière                future → tunnel de portes d'étoiles
   (pour forcer un autre monde : 'world' => 'planet'|'gallery'|'cinema'|'constellation'|'tree'|'tunnel')

   Le chiffre romain d'une étoile (I, II, III…) = son rang dans la liste ci-dessous.
   Les 'position' valides (une seule fois chacune) :
     'bottom-tip' 'right-lower' 'right-mid' 'right-upper' 'top-dip' 'left-upper' 'left-mid' 'left-lower'

   Champs :  position, type, title, text   → obligatoires
             'items'   => ['phrase 1', 'phrase 2']  → morceaux lus un par un dans le monde
                          (sinon 'text' est découpé en phrases automatiquement)
             'media'   => ['type' => 'photo'|'video', 'src' => 'assets/…']       → 1 photo ou 1 vidéo
             'gallery' => [['src' => 'assets/photos/a.jpg', 'caption' => '…'], …] → plusieurs photos
             'accent'  => '#F3A8C7'  → couleur du monde      'kicker' => 'Souvenir' → petit titre
   ══════════════════════════════════════════════════════════════════════════ */
$constellationStars = [

    /* ── ÉTOILE I · pointe du bas · monde : PLANÈTE-SOUVENIR ── */
    [
        'position' => 'bottom-tip',
        'type'     => 'memory',
        'title'    => 'Notre rencontre',                                       // ★ titre
        'kicker'   => 'Souvenir',                                              //   petit titre (facultatif)
        // ★ Chaque phrase devient une lune à toucher. Remplace TOUT le texte entre crochets [...].
        'text'     => "Je ne savais pas encore quelle place tu prendrais dans ma vie. Je savais seulement que quelque chose chez toi attirait doucement mon cœur vers toi. Ton intelligence, ta façon de parler, et surtout cette manière que tu avais de me regarder… J’avais le sentiment que tu cherchais à voir qui j’étais vraiment, au-delà de ce que je pouvais offrir.Avec toi, je me suis senti vu, compris, et doucement apprécié pour la personne que je suis. Je ne sais pas à quel instant précis mon cœur a commencé à s’attacher, mais je sais que tu es devenue différente des autres.❤️",
        'media'    => null,
    ],

    /* ── ÉTOILE II · haut droit · monde : GALERIE (photo) ── */
    [
        'position' => 'right-upper',
        'type'     => 'photo',
        'title'    => 'Each other Home ❤️',                                    // ★ titre
        'text'     => "C'est étrange comme deux personnes peuvent se trouver au milieu de tant de choses, puis devenir doucement refuge l'une de l'autre. Avec toi, le silence n'était jamais vide, et le sommeil n'était plus seulement du repos: c'était cette paix rare de pouvoir fermer les yeux en sachant que l'on est bien, simplement parce que l'autre est là. Nous nous sommes trouvés, sans le prévoir. Mon cœur avait reconnu quelque chose dans le tien, quelque chose qui ressemblait à la maison.", // ★ texte (devient une carte à côté de la photo)
        'gallery' => [['src' => 'assets/photos/sommeil.jpeg', 'caption' => 'Moi'], ['src' => 'assets/photos/sommeil2.jpeg', 'caption' => 'Toi']],  // 📁 ★ dépose la photo dans assets/photos/ et corrige le nom ici
        // 💡 Plusieurs photos ? Remplace la ligne 'media' par :
        // 'gallery' => [['src' => 'assets/photos/a.jpg', 'caption' => 'Légende A'], ['src' => 'assets/photos/b.jpg', 'caption' => 'Légende B']],
    ],

    /* ── ÉTOILE III · haut gauche ·monde : CINÉMA CÉLESTE (vidéo) ── */
    [
        'position' => 'left-upper',
        'type'     => 'video',
        'title'    => 'Avant même de le savoir…',                                    // ★ titre
        'text'     => "Quand je regarde cette vidéo, je revois deux personnes qui, sans vraiment le savoir, étaient en train de devenir quelque chose de précieux l'une pour l'autre. Tes petits moments de timidité, nos conversations, mes regards… Il y avait déjà quelque chose de doux entre nous. Aujourd'hui, je réalise que nous avions déjà commencé à écrire notre histoire, un sourire et un instant à la fois. Et regarde-nous, tout le chemin que nous avons parcouru depuis.❤️",         // ★ texte
       'media'    => ['type' => 'video', 'src' => 'assets/videos/savid.mp4'],  // 📁 ★ dépose la vidéo (mp4) dans assets/videos/ et corrige le nom
    ],

    /* ── ÉTOILE IV · milieu droit · monde : CONSTELLATION VIVANTE ── */
    [
        'position' => 'right-mid',
        'type'     => 'trait',
        'title'    => 'Une petite chose que j\'aime chez toi',                 // ★ titre
        // ★ Une phrase = une étoile à allumer (jusqu'à 9).
        'text'     => "Il y a tant de choses que j’aime chez toi. Tu sais me calmer comme personne, mais tu sais aussi me rendre fou parfois.😂Et pourtant, si tu me demandais ce que j’aime le plus chez toi, je ne saurais pas vraiment quoi répondre. Parce qu’au fond, ce n’est pas seulement ton sourire, ni tes yeux, ni ta voix. C’est toi. Toi, tout simplement. Je t’aime, et parfois, c’est la seule raison que mon cœur sait donner.❤️",
        'media'    => null,
    ],

    /* ── ÉTOILE V · milieu gauche · monde : CONSTELLATION VIVANTE ── */
    [
        'position' => 'left-mid',
        'type'     => 'trait',
        'title'    => 'Une autre petite chose',                                // ★ titre
        'text'     => "J’admire ta force, tes ambitions, ton intelligence et ta résilience. J’aime cette femme qui continue d’avancer malgré ses blessures, qui doute parfois, mais qui n’abandonne pas. J’aime tes imperfections autant que tes qualités.❤️Et même quand tu es fatiguée d’être forte, j’aimerais être là pour toi, t’apporter un peu de paix et te rappeler que tu mérites autant d’amour que tu en donnes.", // ★
        'media'    => null,
    ],

    /* ── ÉTOILE VI · bas droit · monde : CINÉMA CÉLESTE (vidéo) ── */
    [
        'position' => 'right-lower',
        'type'     => 'video',
        'title'    => 'Exemple de légende',                                    // ★ titre
        'text'     => "[Décris ce souvenir en une phrase.]",                    // ★ phrase (affichée sur l'écran si la vidéo manque)
        'media'    => ['type' => 'video', 'src' => 'assets/videos/video1.mp4'],  // 📁 ★ dépose la vidéo (mp4) dans assets/videos/ et corrige le nom
    ],

    /* ── ÉTOILE VII · bas gauche · monde : ARBRE DE LUMIÈRE ── */
    [
        'position' => 'left-lower',
        'type'     => 'lesson',
        'title'    => 'Ce que cette histoire m\'a appris',                     // ★ titre
        // ★ Une phrase = une lumière de l'arbre (jusqu'à 9).
        'text'     => "Notre histoire m’a appris beaucoup de choses sur moi-même, surtout sur ma façon de réagir quand je suis blessé. Je sais que j’ai encore du travail à faire sur moi, notamment apprendre à me calmer, à moins supposer et à ne pas laisser le silence parler à ma place. J’aimerais qu’on apprenne à mieux communiquer, même quand on est fâchés. Qu’on prenne un moment chaque semaine pour parler de nous, de ce qui va et de ce qui nous fait mal, sans avoir peur d’être honnêtes. Je sais que certaines choses ont été abîmés, mais je ne veux pas que la colère et le silence finissent par parler à notre place.❤️",
        'media'    => null,
    ],

    /* ── ÉTOILE VIII · creux du haut · monde : TUNNEL D'ÉTOILES ── */
    [
        'position' => 'top-dip',
        'type'     => 'future',
        'title'    => "L'avenir",                                              // ★ titre (affiché aussi à la fin du voyage)
        // ★ Une phrase = une porte à franchir, avec un souhait (jusqu'à 8).
        'text'     => "[Pas des promesses — juste des souhaits.] [Un endroit que tu aimerais partager avec elle.] [Une expérience à vivre un jour.] [Un souhait pour elle.]",
        'media'    => null,
    ],
];

/* ══════════════════════════════════════════════════════════════════════════
   ★4 · LA LETTRE — s'ouvre en touchant le cœur lumineux, quand toutes les
        étoiles sont allumées. Un paragraphe = un écran dans le cœur 3D.
   ══════════════════════════════════════════════════════════════════════════ */
$letterTitle = "Ce que je n'exprime pas toujours";                              // ★ titre de la lettre
$letterParagraphs = [                                                          // ★ ajoute ou retire des paragraphes à volonté
    "[Première pensée — comment tu te sens en lui écrivant cette lettre.]",
    "[Ce qu'elle a représenté pour toi, simplement, sans détour.]",
    "[Ce que votre histoire t'a appris sur toi-même ou sur l'amour.]",
    "[Ce que tu admires encore chez elle aujourd'hui.]",
];
$letterSignoff = "[Une dernière ligne, signée de ton prénom.]";                  // ★ signature (affichée en doré, à la fin)

/* ══════════════════════════════════════════════════════════════════════════
   ★5 · PHRASES D'OUVERTURE — film d'introduction (première visite seulement)
   ══════════════════════════════════════════════════════════════════════════ */
$introLines = [
    "Parmi des milliards d'étoiles…",                                          // ★ 1re phrase (pendant que les étoiles se dispersent)
    "j'en ai trouvé une.",                                                     // ★ 2e phrase (quand le portrait apparaît)
];

/* ══════════════════════════════════════════════════════════════════════════
   ★6 · MUSIQUE — plusieurs chansons jouées l'une après l'autre
   📁 Dépose tes chansons (mp3 conseillé ; m4a, ogg, wav acceptés) dans :  assets/audio/
      Quand la première se termine (avec un fondu), la suivante démarre toute seule.
   ══════════════════════════════════════════════════════════════════════════ */
$music = [
    // ★ 'auto' = toutes les chansons du dossier, dans l'ORDRE ALPHABÉTIQUE (astuce : nomme-les 01-…, 02-…).
    //   Pour choisir toi-même l'ordre : 'tracks' => ['premiere-chanson.mp3', 'deuxieme-chanson.mp3'],
    'tracks'  => 'auto',
    'loop'    => true,      // ★ true = après la dernière chanson, on recommence à la première · false = silence à la fin
    'shuffle' => false,     //   true = ordre aléatoire
    'volume'  => 0.55,      // ★ volume de la musique (0 à 1)
];