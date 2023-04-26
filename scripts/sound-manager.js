import { moduleName } from './main.js';

let paused = [];

export function pauseMusic(soundDoc) {
	if (!soundDoc.getFlag(moduleName, 'pause')) return;
	paused = game.playlists.playing.map((p) => p.sounds.contents.filter((p) => p.playing)).flat();
	for (const sound of paused) sound.update({ playing: false, pausedTime: sound.sound.currentTime });
}

export function resumeMusic(soundDoc) {
	if (!soundDoc.getFlag(moduleName, 'pause')) return;
	for (const sound of paused) sound.update({ playing: true });
	paused = [];
}
