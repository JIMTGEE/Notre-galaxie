<?php
declare(strict_types=1);
require __DIR__ . '/data.php';
define('PORTRAIT_AS_LIB', true);
require __DIR__ . '/portrait.php';

/**
 * index.php assemble la page. Il ne contient aucun texte à modifier :
 * toute l'histoire est dans data.php. Ici, on normalise le contenu
 * (valeurs par défaut sûres) puis on le transmet aux scripts en JSON.
 */

$site = array_merge([
    'recipient' => 'Toi', 'title' => 'Notre petite galaxie', 'subtitle' => '', 'tagline' => '', 'always_fresh' => true,
], $site ?? []);

/* monde par défaut selon le type d'étoile */
$worldByType = ['memory' => 'planet', 'photo' => 'gallery', 'video' => 'cinema', 'trait' => 'constellation', 'lesson' => 'tree', 'future' => 'tunnel'];
$kickerByType = ['memory' => 'Souvenir', 'photo' => 'Instant', 'video' => 'Séquence', 'trait' => 'Ce que j\'aime', 'lesson' => 'Leçon', 'future' => 'Avenir'];
$validWorlds = ['planet', 'gallery', 'cinema', 'constellation', 'tree', 'tunnel'];

$stars = [];
foreach (($constellationStars ?? []) as $s) {
    $type = (string) ($s['type'] ?? 'memory');
    $world = (string) ($s['world'] ?? ($worldByType[$type] ?? 'planet'));
    if (!in_array($world, $validWorlds, true)) {
        $world = $worldByType[$type] ?? 'planet';
    }
    $text = trim((string) ($s['text'] ?? ''));
    /* 'items' peut mélanger texte et média, DANS L'ORDRE VOULU : une chaîne = un fragment de texte à lire ;
       ['media' => ['type'=>'photo'|'video','src'=>'…','caption'=>'…']] = une photo/vidéo insérée à cette place précise
       (ni forcément en premier, ni forcément séparée du texte — l'ordre du tableau fait foi). */
    $items = [];
    foreach ((array) ($s['items'] ?? []) as $it) {
        if (is_array($it) && isset($it['media']) && is_array($it['media']) && !empty($it['media']['src'])) {
            $items[] = ['type' => 'media', 'media' => [
                'type'    => (string) ($it['media']['type'] ?? 'photo'),
                'src'     => (string) $it['media']['src'],
                'caption' => (string) ($it['media']['caption'] ?? ''),
            ]];
        } elseif (is_string($it)) {
            $t = trim($it);
            if ($t !== '') { $items[] = ['type' => 'text', 'text' => $t]; }
        }
    }
    if (!$items && $text !== '') {                       // sans 'items' : le texte est découpé en phrases
        $parts = array_values(array_filter(array_map('trim', preg_split('/(?<=[.!?…\]])\s+/u', $text) ?: [$text]), 'strlen'));
        foreach ($parts as $p) { $items[] = ['type' => 'text', 'text' => $p]; }
    }
    $gallery = [];
    foreach ((array) ($s['gallery'] ?? []) as $g) {
        if (is_string($g)) { $g = ['src' => $g]; }
        if (!empty($g['src'])) { $gallery[] = ['src' => (string) $g['src'], 'caption' => (string) ($g['caption'] ?? '')]; }
    }
    $media = $s['media'] ?? null;
    $mediaNorm = (is_array($media) && !empty($media['src']))
        ? ['type' => (string) ($media['type'] ?? 'photo'), 'src' => (string) $media['src'], 'caption' => (string) ($media['caption'] ?? '')]
        : null;
    if (!$gallery && $mediaNorm && $mediaNorm['type'] === 'photo') {
        $gallery[] = ['src' => $mediaNorm['src'], 'caption' => $mediaNorm['caption'] !== '' ? $mediaNorm['caption'] : (string) ($s['title'] ?? '')];
    }
    /* le champ 'media' tout seul (sans position choisie dans 'items') reste pratique pour un ajout rapide :
       pour les mondes qui ne l'affichent pas déjà nativement (cinéma = l'écran, galerie = la photo ci-dessus),
       il rejoint simplement la fin de la séquence 'items' plutôt que d'imposer un bouton toujours séparé. */
    $nativelyConsumed = ($world === 'cinema' && $mediaNorm && $mediaNorm['type'] === 'video')
        || ($world === 'gallery' && $mediaNorm && $mediaNorm['type'] === 'photo');
    if ($mediaNorm && !$nativelyConsumed) {
        $items[] = ['type' => 'media', 'media' => $mediaNorm];
    }
    $stars[] = [
        'position' => (string) ($s['position'] ?? 'bottom-tip'),
        'type'     => $type,
        'world'    => $world,
        'title'    => (string) ($s['title'] ?? ''),
        'kicker'   => (string) ($s['kicker'] ?? ($kickerByType[$type] ?? '')),
        'text'     => $text,
        'items'    => $items,
        'gallery'  => $gallery,
        'media'    => $mediaNorm,
        'accent'   => isset($s['accent']) ? (string) $s['accent'] : null,
    ];
}

$portraitCfg = array_merge(['enabled' => true, 'caption' => $site['recipient'], 'subtitle' => '', 'stars' => 24000, 'mode' => 'auto', 'hair' => 'auto', 'invert' => false, 'focus' => null], $portrait ?? []);
$portraitFile = $portraitCfg['enabled'] ? portrait_find() : null;
$portraitCfg['src'] = portrait_url($portraitFile);       // null → pas de portrait, l'ouverture continue sans

/* musique : toutes les chansons de assets/audio/ (ordre alphabétique) ou la liste choisie dans data.php ($music) */
$musicCfg = array_merge(['tracks' => 'auto', 'loop' => true, 'shuffle' => false, 'volume' => 0.55], $music ?? []);
$audioDir = __DIR__ . '/assets/audio';
$audioExt = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'webm', 'flac'];
$audioNames = [];
if (is_array($musicCfg['tracks'])) {
    foreach ($musicCfg['tracks'] as $t) { $audioNames[] = basename((string) $t); }          // basename : pas de chemin extérieur au dossier
} else {
    $found = glob($audioDir . '/*', GLOB_NOSORT) ?: [];
    sort($found, SORT_NATURAL | SORT_FLAG_CASE);
    foreach ($found as $f) {
        if (is_file($f) && filesize($f) > 0 && in_array(strtolower(pathinfo($f, PATHINFO_EXTENSION)), $audioExt, true)) { $audioNames[] = basename($f); }
    }
}
$tracks = [];
foreach ($audioNames as $n) {
    $p = $audioDir . '/' . $n;
    if (is_file($p) && filesize($p) > 0) { $tracks[] = ['src' => 'assets/audio/' . rawurlencode($n) . '?v=' . (int) @filemtime($p), 'title' => pathinfo($n, PATHINFO_FILENAME)]; }
}
$musicOut = ['tracks' => $tracks, 'loop' => (bool) $musicCfg['loop'], 'shuffle' => (bool) $musicCfg['shuffle'], 'volume' => max(0.0, min(1.0, (float) $musicCfg['volume']))];

$flags = JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP;
$configJson = json_encode([
    'site'     => $site,
    'stars'    => $stars,
    'letter'   => ['title' => $letterTitle ?? 'La lettre', 'paragraphs' => array_values($letterParagraphs ?? []), 'signoff' => $letterSignoff ?? ''],
    'intro'    => ['lines' => array_values($introLines ?? [])],
    'portrait' => $portraitCfg,
    'music'    => $musicOut,
], $flags);
$v = static fn (string $f): int => (int) @filemtime(__DIR__ . '/' . $f);
$name = htmlspecialchars((string) $site['recipient'], ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<?php /* ★ PERSO (facultatif) : couleur de la barre du navigateur sur mobile */ ?>
<meta name="theme-color" content="#05040d">
<meta name="robots" content="noindex,nofollow">
<title><?= htmlspecialchars((string) $site['title'], ENT_QUOTES, 'UTF-8') ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<?php /* ★ PERSO (facultatif) : polices Google. Si tu en changes, change aussi --font-display / --font-elegant / --font-body en haut de style.css */ ?>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,500;1,300;1,500&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Quicksand:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css?v=<?= $v('style.css') ?>">
</head>
<body data-state="loading">

<!-- Scène WebGL + effets plein écran -->
<canvas id="sky"></canvas>
<canvas id="fx"></canvas>
<div id="vignette" aria-hidden="true"></div>
<div id="cursor-aura" aria-hidden="true"></div>
<div id="flash" aria-hidden="true"></div>

<!-- Étiquettes des constellations + balises des étoiles (boutons accessibles) -->
<div id="sky-labels" aria-hidden="true"></div>
<div id="constellation-points"></div>

<!-- Ouverture cinématique -->
<div id="stage-text" class="stage-text" aria-live="polite"></div>
<div id="portrait-caption" class="portrait-caption" aria-live="polite"></div>
<?php /* ★ PERSO (facultatif) : texte du bouton « Passer l'introduction » */ ?>
<button id="intro-skip" class="skip ui" type="button" hidden>Passer l'introduction <kbd>Échap</kbd></button>

<!-- ======= PORTE D'ENTRÉE ======= -->
<section id="gate" class="gate" aria-labelledby="gate-title">
  <div class="gate-top"><span class="g-kicker"><?= htmlspecialchars((string) $site['subtitle'], ENT_QUOTES, 'UTF-8') ?></span></div>
  <div class="gate-center">
    <p class="g-pre">pour</p>
    <h1 id="gate-title" class="g-name"><?= $name ?></h1>
    <p class="g-sub"><?= htmlspecialchars((string) $site['tagline'], ENT_QUOTES, 'UTF-8') ?></p>
    <?php /* ★ PERSO (facultatif) : textes de la porte d'entrée écrits en dur — « Préparation du ciel… », « Entrer dans la galaxie », « Une expérience à vivre avec le son… », « fait avec amour ». Son prénom, son titre et ses phrases viennent de data.php. */ ?>
    <div id="g-load" class="g-load" role="status" aria-live="polite">
      <div class="g-ring">
        <svg viewBox="0 0 80 80" aria-hidden="true"><circle class="g-ring-bg" cx="40" cy="40" r="34"/><circle id="g-ring-c" class="g-ring-fg" cx="40" cy="40" r="34"/></svg>
        <b id="g-pct">0</b>
      </div>
      <span id="g-label">Préparation du ciel…</span>
    </div>
    <button id="start-btn" class="g-enter ui" type="button" hidden><span>Entrer dans la galaxie</span><i aria-hidden="true"></i></button>
    <p class="g-note">Une expérience à vivre avec le son&nbsp;· plein écran conseillé</p>
  </div>
  <div class="gate-bottom"><span>✦ &nbsp;fait avec amour&nbsp; ✦</span></div>
</section>

<!-- ======= HUD du cœur ======= -->
<header id="hud" class="hud ui" hidden>
  <div class="hud-brand"><span class="hb-star" aria-hidden="true">✦</span><div><b id="hud-title"></b><i id="hud-sub"></i></div></div>
  <nav class="hud-actions" aria-label="Commandes">
    <button id="btn-portrait" class="hud-btn ui" type="button" title="Revoir son portrait d'étoiles" aria-label="Revoir son portrait d'étoiles"><svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="4"/><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5"/></svg></button>
    <button id="btn-consts" class="hud-btn ui" type="button" title="Afficher / masquer les constellations" aria-label="Constellations"><svg viewBox="0 0 24 24"><circle cx="5" cy="17" r="1.6"/><circle cx="11" cy="8" r="1.6"/><circle cx="19" cy="13" r="1.6"/><circle cx="16" cy="4.5" r="1.2"/><path d="M5 17l6-9 8 5M11 8l5-3.5"/></svg></button>
    <button id="music-toggle" class="hud-btn ui" type="button" aria-label="Activer ou couper le son" title="Son"><svg viewBox="0 0 24 24" class="icon-note"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></button>
    <button id="btn-full" class="hud-btn ui" type="button" title="Plein écran" aria-label="Plein écran"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
    <button id="btn-help" class="hud-btn ui" type="button" title="Aide" aria-label="Aide"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8M12 17.2v.1"/></svg></button>
  </nav>
</header>
<?php /* ★ PERSO (facultatif) : « étoiles allumées » (compteur en bas à gauche) */ ?>
<aside id="hud-progress" class="hud-progress ui" hidden aria-label="Progression">
  <svg id="hp-heart" viewBox="-9 -8.4 18 16.4" aria-hidden="false"></svg>
  <div class="hp-text"><b id="hp-count">0/0</b><span>étoiles allumées</span></div>
</aside>
<p id="hint" class="hint" aria-live="polite"></p>
<div id="toast" class="toast ui" role="status"></div>

<!-- ======= HUD des mondes ======= -->
<?php /* ★ PERSO (facultatif) : « Retour au cœur » (bouton dans chaque monde) */ ?>
<div id="world-hud" class="world-hud" hidden>
  <button id="w-back" class="w-back ui" type="button"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg><span>Retour au cœur</span></button>
  <div class="w-title"><span id="w-kicker"></span><h2 id="w-title"></h2></div>
  <p id="w-hint" class="w-hint"></p>
  <nav id="w-chips" class="w-chips" aria-label="Éléments de ce monde"></nav>
  <div id="w-extra" class="w-extra"></div>
</div>
<div id="chapter-card" class="chapter-card" aria-hidden="true"></div>

<!-- Lecteur de texte (fragments, lettre…) -->
<aside id="reader" class="reader ui" hidden aria-live="polite">
  <div class="reader-card">
    <header><span id="reader-kicker" class="reader-kicker"></span><button id="reader-close" class="reader-close ui" type="button" aria-label="Fermer">✕</button></header>
    <h3 id="reader-title" class="reader-title"></h3>
    <div id="reader-media" class="reader-media" hidden></div>
    <div id="reader-body" class="reader-body"></div>
    <footer><button id="reader-prev" class="reader-nav ui" type="button" aria-label="Précédent">‹</button><span id="reader-count" class="reader-count"></span><button id="reader-next" class="reader-nav ui" type="button" aria-label="Suivant">›</button></footer>
  </div>
</aside>

<?php /* 📁 ★ MUSIQUE (facultatif) : dépose tes chansons dans assets/audio/ — elles sont jouées l'une après l'autre. L'ordre, la boucle et le volume se règlent dans data.php (★6 $music). */ ?>
<!-- Musique d'ambiance : la liste des chansons est lue par js/engine.js depuis la configuration -->
<audio id="bg-music" preload="none"></audio>

<!-- Configuration injectée par PHP depuis data.php -->
<script type="application/json" id="gx-config"><?= $configJson ?></script>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="js/engine.js?v=<?= $v('js/engine.js') ?>"></script>
<script src="js/portrait.js?v=<?= $v('js/portrait.js') ?>"></script>
<script src="js/hub.js?v=<?= $v('js/hub.js') ?>"></script>
<script src="js/worlds.js?v=<?= $v('js/worlds.js') ?>"></script>
<script src="js/app.js?v=<?= $v('js/app.js') ?>"></script>
</body>
</html>