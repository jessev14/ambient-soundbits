export function createSoundWaves(sound) {
	const size = sound.radius * 1.5;
	const duration = sound.sound.duration * 1000;
	const rings = ~~(duration / 2000);
	canvas.ping({ x: sound.x, y: sound.y }, { size, color: 0xffffff, duration, rings });
}
