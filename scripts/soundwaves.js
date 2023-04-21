export function createSoundWaves(sound) {
	const size = sound.radius * 1.5;
	const duration = sound.sound.duration * 1000;
	const rings = ~~(duration / 2000);
	const name = sound.id;
	canvas.ping(
		{ x: sound.x, y: sound.y },
		{ size, color: 0xffffff, duration, rings, name, los: { bounds: sound.source.los.bounds, points: sound.source.los.points } }
	);
}
