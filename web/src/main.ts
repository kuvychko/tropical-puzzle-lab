import './style.css';
import { renderGallery } from './gallery/gallery';
import { startPlayer } from './player/player';

// Query-string routing (?puzzle=rev2&seed=123) so direct links survive a reload on static hosting.
const params = new URLSearchParams(window.location.search);
const puzzleId = params.get('puzzle');
const root = document.getElementById('app')!;

if (puzzleId && /^[a-z0-9][a-z0-9-]*$/.test(puzzleId)) {
  void startPlayer(root, puzzleId, params);
} else {
  void renderGallery(root);
}
