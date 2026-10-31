<?php
declare(strict_types=1);

/**
 * portrait.php — sert la photo du portrait de façon sûre et optimisée.
 *
 *  • Dépose UNE photo (jpg, png, webp, avif) dans  assets/portrait/
 *    → le système la détecte tout seul (aucun nom imposé).
 *  • La photo est redressée (orientation EXIF du téléphone), réduite
 *    à 900 px, ses métadonnées (GPS, appareil, date…) sont supprimées,
 *    puis mise en cache. Le fichier ORIGINAL n'est jamais servi.
 *  • Si l'extension GD de PHP manque, la photo est servie telle quelle
 *    (le navigateur sait la lire) — rien ne casse.
 *
 *  Diagnostic : ouvre  portrait.php?info  dans ton navigateur.
 */

const PORTRAIT_DIR = __DIR__ . '/assets/portrait';
const PORTRAIT_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
const PORTRAIT_MAX_SIDE = 1280;
const PORTRAIT_MAX_BYTES = 30 * 1024 * 1024;

/** Première image valide du dossier (ordre alphabétique), ou null. */
function portrait_find(): ?string
{
    if (!is_dir(PORTRAIT_DIR)) {
        return null;
    }
    $files = glob(PORTRAIT_DIR . '/*', GLOB_NOSORT) ?: [];
    sort($files, SORT_NATURAL | SORT_FLAG_CASE);
    foreach ($files as $f) {
        $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
        if (is_file($f) && in_array($ext, PORTRAIT_EXT, true) && filesize($f) > 0 && filesize($f) <= PORTRAIT_MAX_BYTES) {
            return $f;
        }
    }
    return null;
}

/** Adresse publique de l'image traitée (avec empreinte pour le cache navigateur). */
function portrait_url(?string $file): ?string
{
    return $file === null ? null : 'portrait.php?v=' . (int) @filemtime($file);
}

/** Applique l'orientation EXIF à une ressource GD. */
function portrait_orient($img, string $file)
{
    if (!function_exists('exif_read_data') || !in_array(strtolower(pathinfo($file, PATHINFO_EXTENSION)), ['jpg', 'jpeg'], true)) {
        return $img;
    }
    $exif = @exif_read_data($file);
    $o = (int) ($exif['Orientation'] ?? 1);
    switch ($o) {
        case 2: imageflip($img, IMG_FLIP_HORIZONTAL); break;
        case 3: $img = imagerotate($img, 180, 0) ?: $img; break;
        case 4: imageflip($img, IMG_FLIP_VERTICAL); break;
        case 5: imageflip($img, IMG_FLIP_HORIZONTAL); $img = imagerotate($img, 90, 0) ?: $img; break;
        case 6: $img = imagerotate($img, -90, 0) ?: $img; break;
        case 7: imageflip($img, IMG_FLIP_HORIZONTAL); $img = imagerotate($img, -90, 0) ?: $img; break;
        case 8: $img = imagerotate($img, 90, 0) ?: $img; break;
    }
    return $img;
}

/** Traite l'image : redresse, réduit, nettoie. Retourne [binaire, mime] ou null. */
function portrait_process(string $file): ?array
{
    if (!function_exists('imagecreatefromstring') || !function_exists('getimagesize')) {
        return null;
    }
    $size = @getimagesize($file);
    if (!$size || $size[0] < 8 || $size[1] < 8 || $size[0] * $size[1] > 64_000_000) {
        return null;                                   // trop grande pour GD : on sert l'original
    }
    $data = @file_get_contents($file);
    $src = $data === false ? false : @imagecreatefromstring($data);
    if (!$src) {
        return null;
    }
    $src = portrait_orient($src, $file);
    [$w, $h] = [imagesx($src), imagesy($src)];
    $scale = min(1.0, PORTRAIT_MAX_SIDE / max($w, $h));
    $nw = max(1, (int) round($w * $scale));
    $nh = max(1, (int) round($h * $scale));
    $dst = imagecreatetruecolor($nw, $nh);
    $hasAlpha = in_array(strtolower(pathinfo($file, PATHINFO_EXTENSION)), ['png', 'webp', 'avif'], true);
    if ($hasAlpha) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
    }
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    ob_start();
    if ($hasAlpha) {
        imagepng($dst, null, 6);
        $mime = 'image/png';
    } else {
        imageinterlace($dst, true);
        imagejpeg($dst, null, 88);
        $mime = 'image/jpeg';
    }
    $bin = (string) ob_get_clean();
    return $bin === '' ? null : [$bin, $mime];
}

/* Inclusion depuis index.php : on s'arrête ici, seules les fonctions sont utilisées. */
if (defined('PORTRAIT_AS_LIB')) {
    return;
}

/* ------------------------- point d'accès HTTP ------------------------- */
$file = portrait_find();

if (isset($_GET['info'])) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'found'     => $file !== null ? basename($file) : null,
        'folder'    => 'assets/portrait/',
        'gd'        => function_exists('imagecreatefromstring'),
        'exif'      => function_exists('exif_read_data'),
        'avif'      => function_exists('imagecreatefromavif'),
        'extensions' => PORTRAIT_EXT,
        'hint'      => $file === null ? 'Dépose une photo (jpg, png, webp, avif) dans assets/portrait/' : 'OK',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($file === null) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'no-portrait']);
    exit;
}

$mtime = (int) filemtime($file);
$etag = '"' . md5($file . $mtime . filesize($file)) . '"';
header('Cache-Control: public, max-age=86400');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
    http_response_code(304);
    exit;
}

/* cache disque du résultat traité (dossier temporaire du serveur) */
$cache = sys_get_temp_dir() . '/gx-portrait-' . md5($file . $mtime) . '.bin';
$out = null;
if (is_file($cache) && ($raw = @file_get_contents($cache)) !== false && ($pos = strpos($raw, "\n")) !== false) {
    $out = [substr($raw, $pos + 1), substr($raw, 0, $pos)];
}
if ($out === null) {
    $out = portrait_process($file);
    if ($out !== null) {
        @file_put_contents($cache, $out[1] . "\n" . $out[0], LOCK_EX);
    }
}
if ($out === null) {                                   // GD absent ou image atypique : original
    $mimes = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'avif' => 'image/avif'];
    header('Content-Type: ' . ($mimes[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}
header('Content-Type: ' . $out[1]);
header('Content-Length: ' . strlen($out[0]));
echo $out[0];
